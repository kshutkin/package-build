import { getTimeDiff } from './helpers';

export const mainLoggerText =
    (sourceDir: string, dir: string, configsCount: number, startingTime: number, finishedCount = 0) =>
    (final = false) =>
        `${sourceDir} → ${dir} ${final ? configsCount : finishedCount++} / ${configsCount}${final ? ` in ${getTimeDiff(startingTime)}` : ''}`;
