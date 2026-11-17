# Scoring rule convention

The registry in `criterionRegistry.ts` describes operational data requirements;
its loader state is not a score qualification. Category builders in `criteria/`
and transport `verdict-transport-facts/scoring.ts` own their calculation and
export numeric rules used by the calculation. `scoreHelpRules.ts` registers
translation keys and parameters taken from those same rules; the dialog renders
that registry. Keep a new criterion in an identifiable file, declare its data
requirements and status in the criterion registry, and register translated help
driven by its exported rules.

For discrete rules, `NeighborhoodQualification` is an exclusive discriminated
union, including an explicit not-evaluated reason. The personal journey rule is
an example. Do not infer qualification from loader status or fact markers;
neutral is measured, zero is a score, and unavailable is neither. For continuous
or saturated rules expose their actual parameters rather than inventing classes.
Preserve the public category and fact contracts for snapshots and exports.

`score.ts` merges server categories into the local categories before it applies
category weights. It renormalizes only available, scored categories. The server's
own overall score is not the score displayed by the page. The server score itself
and compiled security inputs have separate data pipelines: change those rules at
their source and update the help alongside them.

Builders attach optional `scoreDetails` to their category results. Detail groups
represent calculation stages, not extra score inputs: rows expose measured values,
active weights, contributions and any correction in the same stage as the builder.
Merge stages are appended after local calculation, and missing data must remain
unevaluated rather than a manufactured measurement. Existing snapshots omit this
optional field and remain readable. Server security details use the artifact's own
indicator weights and compiled score, and are omitted if that contract is absent.
