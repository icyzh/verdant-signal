// culture.js — the CULTURE-LEXICON layer (#3.1, from ORC_BRANDING_NOTES). One map of STABLE ids -> per-culture
// display strings, so an orc warband reads orcish across the whole UI without scattering `culture === 'orc'`
// branches through every callsite. This is PURE DISPLAY — it never touches mechanics, ids, thresholds, save
// keys, or the determinism digest. `cultureWord(culture, id)` falls back to the human string, then to the id.
//
// Each orc entry is the human thing TURNED OVER, not random grotesquerie (settlers who share -> raiders who
// take; a Manager the town chooses -> a Warchief the strongest seizes; harvest -> haul).

export const CULTURE_COPY = {
    human: {
        // nouns / counts
        'noun.settlers': 'COLONISTS',
        // top-bar + panels
        'panel.roster': 'ROSTER', 'panel.chronicle': 'CHRONICLE', 'panel.board': 'BOARD',
        'panel.rosterTitle': 'COLONY ROSTER',
        'panel.chronicleTitle': 'COLONY ARCHIVE', 'panel.rolesTitle': 'COLONY ROLES',
        'panel.recipesTitle': 'COLONY FORMULAE', 'panel.talesTitle': 'FIELD REPORTS',
        // stat columns
        'stat.yield': 'YIELD', 'stat.yld': 'YLD',
        // role titles (UPPERCASE — badges/panels)
        'role.manager': 'COORDINATOR', 'role.watch': 'RANGER', 'role.healer': 'MEDIC',
        // role titles (Title Case — prose beats)
        'roleProse.manager': 'Coordinator', 'roleProse.watch': 'Ranger', 'roleProse.healer': 'Medic',
        // board panel
        'board.title': 'COLONY UPLINK', 'board.project': 'COLONY PROJECT', 'board.plans': 'HABITAT PLANS',
        'board.help': 'HELP WANTED', 'board.ambitions': 'AMBITIONS',
        // world nouns
        'struct.well': 'WATER CONDENSER',
        'struct.silo': 'DEPOT', 'struct.siloDesc': 'Colonists pool surplus supplies here',
        // facilities
        'fac.coop': 'AVIARY POD', 'fac.pen': 'GRAZER PEN', 'fac.sheeppen': 'FIBERBEAST PEN',
        'fac.pond': 'HYDROPONIC POOL', 'fac.mill': 'BIO-MILL', 'fac.hatchery': 'INCUBATOR',
        // boot / settings
        'boot.newTown': 'START A NEW COLONY', 'boot.newTownConfirm': 'SURE? - THIS COLONY IS SET ASIDE',
        'boot.merchant': 'TRADER IN COLONY', 'boot.merchantArriving': 'TRADER INBOUND',
        'boot.unwritten': 'THE COLONY AWAITS ITS FIRST SIGNAL.',
    },
    orc: {
        'noun.settlers': 'SCAVENGERS',
        'panel.roster': 'CREW', 'panel.chronicle': 'THE LOG', 'panel.board': 'RELAY',
        'panel.rosterTitle': 'RAIDER CREW',
        'panel.chronicleTitle': 'SALVAGE LOG', 'panel.rolesTitle': 'CREW ROLES',
        'panel.recipesTitle': 'FIELD TECH', 'panel.talesTitle': 'WASTE REPORTS',
        'stat.yield': 'HAUL', 'stat.yld': 'HAUL',
        'role.manager': 'CAPTAIN', 'role.watch': 'TRACKER', 'role.healer': 'PATCHER',
        'roleProse.manager': 'Captain', 'roleProse.watch': 'Tracker', 'roleProse.healer': 'Patcher',
        'board.title': 'SCRAP RELAY', 'board.project': 'CREW PROJECT', 'board.plans': 'CAMP PLANS',
        'board.help': 'HANDS NEEDED', 'board.ambitions': 'AMBITIONS',
        'struct.well': 'WASTE CONDENSER',
        'struct.silo': 'SCRAP VAULT', 'struct.siloDesc': 'Scavengers pool salvage here',
        'fac.coop': 'SKITTER NEST', 'fac.pen': 'GRAZER CAGE', 'fac.sheeppen': 'FIBERBEAST CAGE',
        'fac.pond': 'SPORE VAT', 'fac.mill': 'SCRAP MILL', 'fac.hatchery': 'BROOD POD',
        'boot.newTown': 'ASSEMBLE A NEW CREW', 'boot.newTownConfirm': 'SURE? - THIS CREW IS DISBANDED',
        'boot.merchant': 'TRADER AT THE GATE', 'boot.merchantArriving': 'A TRADER APPROACHES',
        'boot.unwritten': 'THE CREW WAITS BEYOND THE SIGNAL.',
    },
};

export function cultureWord(culture, id) {
    const c = culture === 'orc' ? 'orc' : 'human';
    return (CULTURE_COPY[c] && CULTURE_COPY[c][id]) || CULTURE_COPY.human[id] || id;
}
