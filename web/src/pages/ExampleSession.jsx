import SessionSummary from '../components/SessionSummary';

const EXAMPLE_SESSION = {
  name: 'Example-AcmeCorp-23rd April',
  startTime: '2025-04-23T10:00:00Z',
  status: 'completed',
  totalSuggestions: 4,
  fullTranscript: [
    { timestamp: '2025-04-23T10:00:12Z', text: "Hi Sarah, thanks for joining. I know you mentioned last time that your team is struggling with pipeline visibility." },
    { timestamp: '2025-04-23T10:00:28Z', text: "Yes, that's right. We're running everything in spreadsheets right now and it's becoming unmanageable with the team growing to 40 reps." },
    { timestamp: '2025-04-23T10:01:05Z', text: "That's a common challenge at your stage. Can you walk me through what a typical deal review looks like for your managers today?" },
    { timestamp: '2025-04-23T10:01:42Z', text: "Honestly it's painful. Managers spend about 3 hours a week just consolidating data from different sheets before they can even start coaching." },
    { timestamp: '2025-04-23T10:02:15Z', text: "3 hours per manager per week, that's significant. How many frontline managers do you have?" },
    { timestamp: '2025-04-23T10:02:28Z', text: "Six. So that's 18 hours a week of manager time just on data wrangling." },
    { timestamp: '2025-04-23T10:03:01Z', text: "If we could cut that down to 15 minutes, what would your managers do with that reclaimed time?" },
    { timestamp: '2025-04-23T10:03:30Z', text: "More coaching, definitely. That's what we hired them for. Our VP of Sales, James Chen, has been pushing hard for this." },
    { timestamp: '2025-04-23T10:04:12Z', text: "Is James the one who'd ultimately sign off on a purchase like this?" },
    { timestamp: '2025-04-23T10:04:25Z', text: "James would champion it, but our CFO Rachel needs to approve anything over $50K annually." },
    { timestamp: '2025-04-23T10:05:00Z', text: "Understood. What does your evaluation process typically look like for tools in this category?" },
    { timestamp: '2025-04-23T10:05:32Z', text: "We'd need a pilot with one team first, then Rachel would want to see ROI data before full rollout. Usually takes about 6 weeks for the pilot." },
    { timestamp: '2025-04-23T10:06:15Z', text: "That makes sense. Are you looking at any other solutions alongside us?" },
    { timestamp: '2025-04-23T10:06:35Z', text: "We've had a demo from Gong and we're also looking at Clari, but honestly your approach to real-time coaching is what caught our attention." },
    { timestamp: '2025-04-23T10:07:10Z', text: "I appreciate that. Let me show you how our real-time coaching works in a live deal scenario..." },
  ],
  suggestions: [
    { type: 'discovery', suggestion: { question: "How does pipeline inaccuracy affect your quarterly forecasting today?" }, timestamp: '2025-04-23T10:02:00Z' },
    { type: 'proof_point', suggestion: { stat: "Companies with 30+ reps see 40% reduction in manager admin time within 90 days of deployment" }, timestamp: '2025-04-23T10:03:15Z' },
    { type: 'case_study', suggestion: { company: 'TechFlow Inc', headline: 'Reduced deal review prep from 3 hours to 20 minutes, increased coaching time by 65%' }, timestamp: '2025-04-23T10:04:00Z' },
    { type: 'discovery', suggestion: { question: "What criteria will Rachel use to evaluate ROI from the pilot?" }, timestamp: '2025-04-23T10:05:45Z' },
  ],
  meddpicc: {
    M: { score: 4, notes: 'Quantified: 18 hours/week manager time on data wrangling across 6 managers' },
    E: { score: 3, notes: 'CFO Rachel is economic buyer for purchases over $50K. VP Sales James Chen is champion' },
    D: { score: 3, notes: 'Need pilot with one team first, then ROI data for full rollout' },
    D2: { score: 3, notes: '6-week pilot evaluation, then CFO approval required' },
    P: { score: 1, notes: 'Paper process not yet discussed' },
    I: { score: 4, notes: 'Clear pain: spreadsheet chaos with 40 reps, managers spending 3hrs/week on admin vs coaching' },
    C: { score: 4, notes: 'VP Sales James Chen actively pushing for solution' },
    C2: { score: 3, notes: 'Competing with Gong and Clari; differentiated on real-time coaching' },
  }
};

const EXAMPLE_ANALYSIS = {
  callNotes: [
    "AcmeCorp has 40 sales reps and 6 frontline managers currently using spreadsheets for pipeline management",
    "Key pain: managers spend ~3 hours/week each (18 hrs total) consolidating data before coaching",
    "VP Sales James Chen is the internal champion; CFO Rachel is the economic buyer for deals >$50K",
    "Evaluation process: 6-week pilot with one team, then ROI review before full rollout",
    "Competing against Gong and Clari; real-time coaching is the key differentiator",
    "Sarah (our contact) is a Sales Operations Manager and is engaged and forthcoming with information"
  ],
  crmUpdate: {
    methodology: 'meddpicc',
    meddpicc: {
      M: "18 hours/week of manager admin time across 6 managers. 40 reps on spreadsheets. Quantifiable ROI opportunity.",
      E: "CFO Rachel, final approver for >$50K. James Chen (VP Sales) is internal champion.",
      D: "Pilot with one team required. ROI data needed before full rollout approval.",
      D2: "6-week pilot → ROI review → CFO sign-off. Standard procurement for this spend level.",
      P: "Not discussed in this call",
      I: "Spreadsheet chaos at scale. Managers hired to coach but spending 3hrs/week on data admin.",
      C: "James Chen (VP Sales) actively pushing for solution. Strong internal advocacy.",
      C2: "Gong (demo completed), Clari (evaluating). Our real-time coaching is differentiated."
    },
    nextSteps: "Schedule pilot kickoff with one team. Send ROI calculator template for Rachel's review. Follow up with James Chen to align on pilot success criteria."
  },
  followUpEmail: {
    subject: "AcmeCorp x Clumo: Next steps from today's call",
    body: `Hi Sarah,

Thanks for taking the time today, really helpful to understand the challenges your team is facing with pipeline visibility at scale.

A few things I took away:
• Your 6 managers are spending ~18 hours/week combined on data consolidation instead of coaching
• A pilot with one team would be the natural first step, with ROI data for Rachel's review
• Real-time coaching during live calls is the capability that stood out vs. alternatives

As discussed, I'll send over:
1. A pilot proposal scoped for one team (6-week timeline)
2. An ROI calculator you can share with Rachel
3. The TechFlow case study: similar scale, similar pain, strong results

Would Thursday work to loop in James for a quick alignment call on pilot success criteria?

Best,
[Your name]`
  },
  nextMeeting: {
    gaps: ['P', 'D2'],
    suggestedTopics: [
      "Clarify paper process / procurement steps and any security or legal review requirements",
      "Define specific pilot success metrics that Rachel would need to see",
      "Understand budget cycle timing: is there allocated budget or does this need a new budget request?",
      "Explore integration requirements with their existing CRM and tools"
    ]
  }
};

export default function ExampleSession() {
  return (
    <SessionSummary
      session={EXAMPLE_SESSION}
      analysis={EXAMPLE_ANALYSIS}
      badge="EXAMPLE"
    />
  );
}
