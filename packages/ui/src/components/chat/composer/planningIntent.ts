const PLAN_TERM = /\b(plan|planning|roadmap|strategy)\b/i;
const PLAN_ACTION = /\b(create|draft|make|build|develop|write|start|need|want|help|approach|organize|organise|figure\s+out|how\s+should|plan|planning)\b/i;
const PLAN_OBJECT = /\b(feature|project|work|task|launch|migration|implementation|rollout|roadmap|strategy|approach|steps|next\s+steps|schedule)\b/i;
const NON_PLANNING_PLAN = /\b(?:mobile|phone|data|internet|subscription|pricing|payment|insurance|meal|diet|workout|floor|flight)\s+plan\b/i;

/**
 * A deliberately small, local heuristic for the Work composer. It only
 * decides whether to advertise /plan; it never changes how the prompt runs.
 */
export const shouldSuggestPlanningCommand = (text: string): boolean => {
    const normalized = text.trim();
    if (!normalized || normalized.startsWith('/')) return false;
    if (!PLAN_TERM.test(normalized)) return false;
    if (NON_PLANNING_PLAN.test(normalized)) return false;

    if (/\bplanning\b/i.test(normalized) || /\broadmap\b/i.test(normalized) || /\bstrategy\b/i.test(normalized)) {
        return true;
    }

    return PLAN_ACTION.test(normalized) && PLAN_OBJECT.test(normalized);
};
