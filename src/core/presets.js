// State settings. The ban date is the date after which a recorded installation counts as non-lead.
export const PRESETS = {
  federal: { ban_date: '1988-06-19', ban_label: 'federal, June 19, 1988', approved_other_sources: false },
  federal_approved: { ban_date: '1988-06-19', ban_label: 'federal, June 19, 1988', approved_other_sources: true },
  california: { ban_date: '1986-01-01', ban_label: 'California, January 1, 1986', approved_other_sources: false },
  vermont: { ban_date: '1989-07-01', ban_label: 'Vermont, July 1, 1989', approved_other_sources: false },
};
export const presetOf = (item) => (typeof item.settings === 'string' ? PRESETS[item.settings] : item.settings) || PRESETS.federal;
