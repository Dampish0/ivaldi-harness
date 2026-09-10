import { describe, expect, test } from 'bun:test';

import { shouldSuggestPlanningCommand } from './planningIntent';

describe('shouldSuggestPlanningCommand', () => {
    test('recognizes explicit planning intent', () => {
        expect(shouldSuggestPlanningCommand('I want to plan the migration')).toBe(true);
        expect(shouldSuggestPlanningCommand('Help me with planning this rollout')).toBe(true);
        expect(shouldSuggestPlanningCommand('Can we make a roadmap for the project?')).toBe(true);
    });

    test('does not advertise planning for unrelated plan nouns', () => {
        expect(shouldSuggestPlanningCommand('What mobile plan should I buy?')).toBe(false);
        expect(shouldSuggestPlanningCommand('Compare these internet plan prices')).toBe(false);
    });

    test('does not compete with an explicit slash command', () => {
        expect(shouldSuggestPlanningCommand('/plan migrate the database')).toBe(false);
    });
});
