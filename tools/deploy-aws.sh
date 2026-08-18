#!/usr/bin/env bash
set -euo pipefail

# A deliberately small, serverless hackathon deployment. It creates one Lambda
# function, one execution role, and one public Function URL. The AWS Lambda Web
# Adapter layer translates requests to the existing Node HTTP server.

AWS_DEPLOY_REGION="${AWS_DEPLOY_REGION:-ap-south-1}"
AWS_FUNCTION_NAME="${AWS_FUNCTION_NAME:-verdant-signal-demo}"
AWS_ROLE_NAME="${AWS_ROLE_NAME:-verdant-signal-demo-lambda}"
AWS_LOG_RETENTION_DAYS="${AWS_LOG_RETENTION_DAYS:-3}"
AWS_WEB_ADAPTER_LAYER_VERSION="${AWS_WEB_ADAPTER_LAYER_VERSION:-28}"

for command_name in aws npm git curl zip; do
    command -v "$command_name" >/dev/null || { echo "Missing required command: $command_name" >&2; exit 1; }
done

AWS_BUILD_REV="$(git rev-parse --short=12 HEAD)"
AWS_BUILD_DIR="$(mktemp -d "${TMPDIR:-/tmp}/verdant-signal-aws.XXXXXX")"
AWS_ZIP_PATH="${AWS_BUILD_DIR}.zip"
trap 'rm -rf -- "$AWS_BUILD_DIR"; rm -f -- "$AWS_ZIP_PATH"' EXIT

# Explicit allowlist: local secrets, git metadata, tests, and scratch files never
# enter the public deployment package.
cp package.json package-lock.json run-aws.sh server.mjs \
    index.html memory-graph.html og-image.png llms.txt robots.txt sitemap.xml \
    favicon.ico apple-touch-icon.png "$AWS_BUILD_DIR/"
cp ./*.js "$AWS_BUILD_DIR/"
cp -R api assets "$AWS_BUILD_DIR/"
chmod +x "$AWS_BUILD_DIR/run-aws.sh"
(cd "$AWS_BUILD_DIR" && npm ci --omit=dev --ignore-scripts)
(cd "$AWS_BUILD_DIR" && zip -qr "$AWS_ZIP_PATH" .)

AWS_TRUST_POLICY='{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}'
if ! aws iam get-role --role-name "$AWS_ROLE_NAME" >/dev/null 2>&1; then
    aws iam create-role \
        --role-name "$AWS_ROLE_NAME" \
        --assume-role-policy-document "$AWS_TRUST_POLICY" >/dev/null
fi
aws iam attach-role-policy \
    --role-name "$AWS_ROLE_NAME" \
    --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
AWS_ROLE_ARN="$(aws iam get-role --role-name "$AWS_ROLE_NAME" --query 'Role.Arn' --output text)"
AWS_ADAPTER_LAYER="arn:aws:lambda:${AWS_DEPLOY_REGION}:753240598075:layer:LambdaAdapterLayerArm64:${AWS_WEB_ADAPTER_LAYER_VERSION}"
AWS_ENVIRONMENT="Variables={NODE_ENV=production,BUILD_REV=${AWS_BUILD_REV},MEMORY_EMBEDDINGS_OFF=1,AWS_LAMBDA_EXEC_WRAPPER=/opt/bootstrap,AWS_LWA_PORT=8080,AWS_LWA_READINESS_CHECK_PATH=/api/build,AWS_LWA_READINESS_CHECK_HEALTHY_STATUS=200-399,PORT=8080}"

if aws lambda get-function --region "$AWS_DEPLOY_REGION" --function-name "$AWS_FUNCTION_NAME" >/dev/null 2>&1; then
    aws lambda update-function-code \
        --region "$AWS_DEPLOY_REGION" \
        --function-name "$AWS_FUNCTION_NAME" \
        --zip-file "fileb://${AWS_ZIP_PATH}" >/dev/null
    aws lambda wait function-updated-v2 --region "$AWS_DEPLOY_REGION" --function-name "$AWS_FUNCTION_NAME"
    aws lambda update-function-configuration \
        --region "$AWS_DEPLOY_REGION" \
        --function-name "$AWS_FUNCTION_NAME" \
        --runtime nodejs24.x \
        --handler run-aws.sh \
        --layers "$AWS_ADAPTER_LAYER" \
        --memory-size 512 \
        --timeout 30 \
        --environment "$AWS_ENVIRONMENT" >/dev/null
else
    # IAM role propagation can lag briefly after creation.
    for attempt in 1 2 3 4 5 6; do
        if aws lambda create-function \
            --region "$AWS_DEPLOY_REGION" \
            --function-name "$AWS_FUNCTION_NAME" \
            --runtime nodejs24.x \
            --handler run-aws.sh \
            --zip-file "fileb://${AWS_ZIP_PATH}" \
            --role "$AWS_ROLE_ARN" \
            --architectures arm64 \
            --layers "$AWS_ADAPTER_LAYER" \
            --memory-size 512 \
            --timeout 30 \
            --environment "$AWS_ENVIRONMENT" >/dev/null; then
            break
        fi
        if [ "$attempt" = 6 ]; then exit 1; fi
        sleep 5
    done
fi
aws lambda wait function-active-v2 --region "$AWS_DEPLOY_REGION" --function-name "$AWS_FUNCTION_NAME"

if ! aws lambda get-function-url-config --region "$AWS_DEPLOY_REGION" --function-name "$AWS_FUNCTION_NAME" >/dev/null 2>&1; then
    aws lambda create-function-url-config \
        --region "$AWS_DEPLOY_REGION" \
        --function-name "$AWS_FUNCTION_NAME" \
        --auth-type NONE >/dev/null
fi

# New public Function URLs require both permissions. Conflicts mean the idempotent
# deployment already installed that statement and are therefore safe to ignore.
aws lambda add-permission \
    --region "$AWS_DEPLOY_REGION" \
    --function-name "$AWS_FUNCTION_NAME" \
    --statement-id FunctionURLAllowPublicAccess \
    --action lambda:InvokeFunctionUrl \
    --principal '*' \
    --function-url-auth-type NONE >/dev/null 2>&1 || true
aws lambda add-permission \
    --region "$AWS_DEPLOY_REGION" \
    --function-name "$AWS_FUNCTION_NAME" \
    --statement-id FunctionURLInvokeAllowPublicAccess \
    --action lambda:InvokeFunction \
    --principal '*' \
    --invoked-via-function-url >/dev/null 2>&1 || true

AWS_LOG_GROUP="/aws/lambda/${AWS_FUNCTION_NAME}"
aws logs create-log-group --region "$AWS_DEPLOY_REGION" --log-group-name "$AWS_LOG_GROUP" >/dev/null 2>&1 || true
aws logs put-retention-policy \
    --region "$AWS_DEPLOY_REGION" \
    --log-group-name "$AWS_LOG_GROUP" \
    --retention-in-days "$AWS_LOG_RETENTION_DAYS"

AWS_FUNCTION_URL="$(aws lambda get-function-url-config --region "$AWS_DEPLOY_REGION" --function-name "$AWS_FUNCTION_NAME" --query FunctionUrl --output text)"
for attempt in 1 2 3 4 5 6; do
    if ACTUAL_REV="$(curl --fail --silent --show-error "${AWS_FUNCTION_URL}api/build" | sed -n 's/.*"rev":"\([^"]*\)".*/\1/p')" \
        && [ "$ACTUAL_REV" = "$AWS_BUILD_REV" ]; then
        break
    fi
    if [ "$attempt" = 6 ]; then
        echo "Deployment verification failed: expected revision ${AWS_BUILD_REV}, got ${ACTUAL_REV:-no response}" >&2
        exit 1
    fi
    sleep 5
done

curl --fail --silent --show-error "${AWS_FUNCTION_URL}" >/dev/null
echo "Deployed ${AWS_BUILD_REV} to ${AWS_FUNCTION_URL}"
