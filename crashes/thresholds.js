/**
 * These values correspond to column names in the source query
 */
const CRASH_NAMES = {
  M: "Main (M)",
  MC: "M + Content (M+C)",
  CS: "C - Content Shutdown (C-S)",
  MCS: "M + C - S",
  P: "NPAPI + GMP Plugin Crashes (P)",
  GPU: "GPU",
};

/**
 * Presently chosen from what appeared to be typical values.
 * Perhaps a more rigorous approach should be employed in future.
 */
const THRESHOLDS = {
  "nightly": {
    [CRASH_NAMES.M]: {lo: 2.59, hi: 5.04},
    [CRASH_NAMES.MC]: {lo: 27.2, hi: 31.8},
    [CRASH_NAMES.CS]: {lo: 3.0, hi: 3.75},
    [CRASH_NAMES.MCS]: {lo: 7.90, hi: 12.82},
    [CRASH_NAMES.P]: {lo: 1.35, hi: 3.10},
  },
  "beta": {
    [CRASH_NAMES.M]: {lo: 3.97, hi: 6.65},
    [CRASH_NAMES.MC]: {lo: 8.21, hi: 12.25},
    [CRASH_NAMES.CS]: {lo: 0.81, hi: 0.88},
    [CRASH_NAMES.MCS]: {lo: 5.18, hi: 8.16},
    [CRASH_NAMES.P]: {lo: 6.03, hi: 10.71},
  },
  "release": {
    [CRASH_NAMES.M]: {lo: 2.17, hi: 4.07},
    [CRASH_NAMES.MC]: {lo: 3.95, hi: 6.89},
    [CRASH_NAMES.CS]: {lo: 0.81, hi: 0.88},
    [CRASH_NAMES.MCS]: {lo: 3.03, hi: 4.02},
    [CRASH_NAMES.P]: {lo: 5.99, hi: 9.74},
  },
  "esr": {
    [CRASH_NAMES.M]: {lo: 2.17, hi: 4.07},
    [CRASH_NAMES.MC]: {lo: 3.95, hi: 6.89},
    [CRASH_NAMES.CS]: {lo: 0.81, hi: 0.88},
    [CRASH_NAMES.MCS]: {lo: 3.03, hi: 4.02},
    [CRASH_NAMES.P]: {lo: 5.99, hi: 9.74},
  },
};
