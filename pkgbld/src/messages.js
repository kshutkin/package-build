import { getTimeDiff } from './helpers.js';

/**
 * @param {string} sourceDir
 * @param {string} dir
 * @param {number} configsCount
 * @param {number} startingTime
 * @param {number} [finishedCount]
 */
export const mainLoggerText =
    (sourceDir, dir, configsCount, startingTime, finishedCount = 0) =>
    (final = false) =>
        `${sourceDir} → ${dir} ${final ? configsCount : finishedCount++} / ${configsCount}${final ? ` in ${getTimeDiff(startingTime)}` : ''}`;
