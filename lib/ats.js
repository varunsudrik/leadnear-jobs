const ATS_LABELS = {
  "4dayweek": "4 Day Week",
  arbeitnow: "Arbeitnow",
  ashby: "Ashby",
  bamboohr: "BambooHR",
  greenhouse: "Greenhouse",
  himalayas: "Himalayas",
  icims: "iCIMS",
  jobicy: "Jobicy",
  remoteok: "Remote OK",
  remotive: "Remotive",
  weworkremotely: "We Work Remotely",
};

export function formatAtsLabel(source = "") {
  return ATS_LABELS[source] || source.replace(/(^|[-_])\w/g, (part) => part.toUpperCase()).replace(/[-_]/g, " ");
}
