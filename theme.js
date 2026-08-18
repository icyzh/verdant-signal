// Verdant Signal's presentation vocabulary. Stable simulation/save identifiers stay unchanged.
const WORDS = [
    [/\bPropagate\b/gi, 'Verdant Signal'],
    [/\bhuman farmers\b/gi, 'colonists'], [/\bhuman farmer\b/gi, 'colonist'],
    [/\borc farmers\b/gi, 'scavengers'], [/\borc farmer\b/gi, 'scavenger'],
    [/\bfarmers\b/gi, 'colonists'], [/\bfarmer\b/gi, 'colonist'],
    [/\btowns\b/gi, 'colonies'], [/\btown\b/gi, 'colony'],
    [/\bhumans\b/gi, 'colonists'], [/\bhuman\b/gi, 'colonist'],
    [/\borcs\b/gi, 'scavengers'], [/\borc\b/gi, 'scavenger'],
    [/\bwarbands\b/gi, 'raider crews'], [/\bwarband\b/gi, 'raider crew'],
    [/\bfarms\b/gi, 'growfields'], [/\bfarm\b/gi, 'growfield'],
    [/\bfarming\b/gi, 'cultivation'],
    [/\bcrops\b/gi, 'xenocrops'], [/\bcrop\b/gi, 'xenocrop'],
    [/\bhouses\b/gi, 'habitats'], [/\bhouse\b/gi, 'habitat'],
    [/\bvillages\b/gi, 'outposts'], [/\bvillage\b/gi, 'outpost'],
];

export function themeText(value) {
    let text = String(value ?? '');
    for (const [pattern, replacement] of WORDS) text = text.replace(pattern, replacement);
    return text;
}
