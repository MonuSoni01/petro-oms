# Renewal Plan Update

The renewal plan structure is now:

1. Quarterly — 3 months — ID: `quarterly`
2. Semi Half-Yearly — 6 months — ID: `semi_half_yearly`
3. Yearly — 12 months — ID: `yearly`

Legacy Firebase plan IDs `monthly` and `half_yearly` are automatically migrated when the Super Admin opens Subscription Control. Existing configured price/user values are preserved; only the plan identity/name/duration are normalized.
