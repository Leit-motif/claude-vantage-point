// The design system's exemplars (spec 181): worked pictures the agent starts from, each built from the
// vocabulary alone, naming its job, the question that says it fits, the facts it needs and the cognitive
// rule it demonstrates. The catalog's techniques (panes/visuals/catalog.ts) are their alphabet. The card
// lab lays every one out at the pane's widths; the decide tool's brief carries the first three inline.
export type Exemplar = {
  id: string
  /** The catalog technique it draws, when one fits. */
  technique: string | null
  job: string
  question: string
  needs: string
  rule: string
  html: string
  height: number
}

export const EXEMPLARS: readonly Exemplar[] = [
  {
    id: 'few-values',
    technique: 'diff-bars',
    job: 'compare a few values on one scale',
    question: 'Does the claim turn on how much bigger one of 2 to 6 values is?',
    needs: 'each value with its label, one scale',
    rule: 'length from zero is read most accurately; one highlight on the value the claim rests on',
    html:
      '<div class="grid" style="row-gap:8px">' +
      '<span class="label">today</span><div class="row gap-2"><div class="track grow"><div class="bar" style="width:100%"></div></div><span class="label" style="min-width:44px">3.06 s</span></div>' +
      '<span class="label">cached</span><div class="row gap-2"><div class="track grow"><div class="bar" style="width:24%"></div></div><span class="label" style="min-width:44px">0.73 s</span></div>' +
      '<span class="label">no launch</span><div class="row gap-2"><div class="track grow"><div class="bar highlight" style="width:1%"></div></div><span class="label" style="min-width:44px">0.01 s</span></div>' +
      '</div>',
    height: 70,
  },
  {
    id: 'sequence',
    technique: 'flow',
    job: 'show what happens in order, a verb on each step between',
    question: 'Does the claim turn on the order things happen in, or where a step is missing?',
    needs: 'three to five steps, the verb that links each pair',
    rule: 'connection groups more strongly than nearness; the step at issue is the one highlight',
    html:
      '<div class="row gap-1">' +
      '<span class="node">decide</span>' +
      '<div class="col grow" style="align-items:center"><span class="caption">checks</span><div class="edge" style="flex:none;width:100%"></div></div>' +
      '<span class="node">counts</span>' +
      '<div class="col grow" style="align-items:center"><span class="caption">skips</span><div class="edge" style="flex:none;width:100%"></div></div>' +
      '<span class="node dim">browser</span>' +
      '<div class="col grow" style="align-items:center"><span class="caption">fills</span><div class="edge" style="flex:none;width:100%"></div></div>' +
      '<span class="node highlight">pane</span>' +
      '</div>',
    height: 28,
  },
  {
    id: 'which-of-many',
    technique: 'units',
    job: 'show which few of many cases the claim is about',
    question: 'Does the claim say how many, where the reader also needs which?',
    needs: 'every case in order, which ones are lit',
    rule: 'a lit unit pops out of dimmed ones before attention; count and position read together',
    html:
      '<div class="col gap-1">' +
      '<div class="row gap-3">' +
      ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'].map(n => `<div class="col gap-1" style="align-items:center"><span class="dot${['3', '9', '10'].includes(n) ? '" style="background:var(--text)' : ' dim'}"></span><span class="label">${n}</span></div>`).join('') +
      '</div>' +
      '<span class="caption">lit: the three planted calls</span>' +
      '</div>',
    height: 58,
  },
  {
    id: 'change-over-time',
    technique: null,
    job: 'show how one measure moved over time, the point at issue marked',
    question: 'Does the claim turn on a trend, a jump or when something changed?',
    needs: 'the measure at each time, in order, the point the claim names',
    rule: 'slope reads change; one marked point and its value, the rest of the line plain',
    html:
      '<svg width="360" height="96" viewBox="0 0 360 96">' +
      '<text class="label" x="28" y="16" text-anchor="end">14</text><text class="label" x="28" y="76" text-anchor="end">0</text>' +
      '<line class="tick" x1="34" y1="72" x2="352" y2="72"/>' +
      '<polyline class="edge" points="40,30 90,26 140,34 190,22 240,62 290,64 340,60"/>' +
      '<circle class="dot highlight" cx="240" cy="62" r="4"/><text class="value" x="240" y="52" text-anchor="middle" style="font-size:13px">2</text>' +
      '<text class="label" x="40" y="90" text-anchor="middle">11-09</text><text class="label" x="240" y="90" text-anchor="middle">11-13</text><text class="label" x="340" y="90" text-anchor="middle">11-15</text>' +
      '</svg>',
    height: 96,
  },
  {
    id: 'before-after',
    technique: 'diff-bars',
    job: 'show a change a fix made, before against after on one scale',
    question: 'Does the claim say something got better or worse by an amount?',
    needs: 'the measure before and after, its unit',
    rule: 'the same scale side by side makes the difference a length; after is the highlight',
    html:
      '<div class="grid" style="row-gap:8px">' +
      '<span class="label">before</span><div class="row gap-2"><div class="track grow"><div class="bar" style="width:92%"></div></div><span class="label" style="min-width:52px">11 refused</span></div>' +
      '<span class="label">after</span><div class="row gap-2"><div class="track grow"><div class="bar highlight" style="width:17%"></div></div><span class="label" style="min-width:52px">2 refused</span></div>' +
      '</div>',
    height: 44,
  },
  {
    id: 'place-in-structure',
    technique: 'tree',
    job: 'show where one thing sits in a structure, and what hangs off it',
    question: 'Does the claim turn on what a thing is part of, or what depends on it?',
    needs: 'the parent, its children, the one the claim is about',
    rule: 'enclosure and links group; the one node is the highlight, the rest stay plain',
    html:
      '<svg width="360" height="112" viewBox="0 0 360 112">' +
      '<line class="edge" x1="180" y1="28" x2="60" y2="76"/><line class="edge" x1="180" y1="28" x2="180" y2="76"/><line class="edge" x1="180" y1="28" x2="300" y2="76"/>' +
      '<rect class="node" x="120" y="4" width="120" height="26" rx="6"/><text class="label" x="180" y="21" text-anchor="middle">panes/</text>' +
      '<rect class="node" x="10" y="76" width="100" height="26" rx="6"/><text class="label" x="60" y="93" text-anchor="middle">visuals/</text>' +
      '<rect class="node highlight" x="130" y="76" width="100" height="26" rx="6"/><text class="label" x="180" y="93" text-anchor="middle" style="fill:var(--text)">design/</text>' +
      '<rect class="node" x="250" y="76" width="100" height="26" rx="6"/><text class="label" x="300" y="93" text-anchor="middle">band/</text>' +
      '</svg>',
    height: 112,
  },
  {
    id: 'threshold',
    technique: 'threshold',
    job: 'show which values clear a line and which fall short',
    question: 'Does the claim turn on a limit, a budget or a cap?',
    needs: 'each value with its label, the line and its value',
    rule: 'a shared baseline and one reference line make over and under read at a glance',
    html:
      '<svg width="360" height="92" viewBox="0 0 360 92">' +
      '<text class="label" x="0" y="15">stylesheet</text><rect class="track" x="80" y="5" width="270" height="12" rx="2"/><rect class="bar highlight" x="80" y="5" width="61" height="12" rx="2"/>' +
      '<text class="label" x="0" y="39">exemplar</text><rect class="track" x="80" y="29" width="270" height="12" rx="2"/><rect class="bar" x="80" y="29" width="34" height="12" rx="2"/>' +
      '<text class="label" x="0" y="63">old brief</text><rect class="track" x="80" y="53" width="270" height="12" rx="2"/><rect class="bar" x="80" y="53" width="250" height="12" rx="2"/>' +
      '<line class="tick" x1="215" y1="0" x2="215" y2="72" stroke-dasharray="3 3"/><text class="caption" x="215" y="88" text-anchor="middle">budget 6,000</text>' +
      '</svg>',
    height: 92,
  },
  {
    id: 'timeline',
    technique: 'rulings',
    job: 'set events on a line in time, the one that matters lit',
    question: 'Does the claim turn on when something happened, or what came before it?',
    needs: 'each event with its date, in order',
    rule: 'position on a common scale is read most accurately; one highlight on the event at issue',
    html:
      '<svg width="360" height="58" viewBox="0 0 360 58">' +
      '<line class="edge" x1="10" y1="20" x2="350" y2="20"/>' +
      '<circle class="dot" cx="20" cy="20" r="5"/><text class="label" x="20" y="44" text-anchor="middle">11-04</text>' +
      '<circle class="dot" cx="120" cy="20" r="5"/><text class="label" x="120" y="44" text-anchor="middle">11-09</text>' +
      '<circle class="dot" cx="220" cy="20" r="5"/><text class="label" x="220" y="44" text-anchor="middle">11-13</text>' +
      '<circle class="dot highlight" cx="330" cy="20" r="6"/><text class="label" x="330" y="44" text-anchor="middle" style="fill:var(--text)">11-15</text>' +
      '</svg>',
    height: 58,
  },
  {
    id: 'options-differ',
    technique: 'ledger',
    job: 'draw the same small picture on each option\'s page with the difference marked',
    question: 'Do the options differ in one place a reader could point to?',
    needs: 'the shared parts, the one part that differs',
    rule: 'small multiples: what stays the same is the frame, the difference is the one highlight',
    html:
      '<div class="card col gap-2">' +
      '<div class="row gap-2"><span class="chip">stylesheet</span><span class="chip">primitives</span><span class="chip highlight">exemplars</span></div>' +
      '<span class="caption">this option adds the exemplars; the other stops at primitives</span>' +
      '</div>',
    height: 81,
  },
]
