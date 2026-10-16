export type SourceFile = {
  name: string;
  kind: 'pdf' | 'image';
};

export type Subtopic = {
  id: string;
  title: string;
  beats: string[];
};

export type Topic = {
  id: string;
  title: string;
  field: string;
  summary: string;
  howTo: string;
  subtopics: Subtopic[];
};

export const topics: Topic[] = [
  {
    id: 'inflation-and-interest-rates',
    title: 'Inflation and interest rates',
    field: 'Economy',
    summary: 'Why prices rise, and why the cost of borrowing moves with them.',
    howTo:
      'Start with what inflation measures, then follow the path from prices to the central bank to a loan.',
    subtopics: [
      {
        id: 'what-inflation-measures',
        title: 'What inflation measures',
        beats: [
          'Inflation is the rate at which prices rise over a stretch of time.',
          'The yardstick is a basket of everyday goods, not a single product.',
        ],
      },
      {
        id: 'money-loses-ground',
        title: 'Why money loses ground',
        beats: [
          'The same cash buys less once prices have climbed.',
          'Wages can catch up, but they usually arrive later than the price rise.',
        ],
      },
      {
        id: 'central-bank-lever',
        title: "The central bank's lever",
        beats: [
          'Raising the policy rate makes new borrowing more expensive.',
          'Dearer credit slows spending, which can cool the rise in prices.',
        ],
      },
      {
        id: 'what-it-means-for-a-loan',
        title: 'What it means for a loan',
        beats: [
          'A higher rate raises the cost of a new mortgage or a business loan.',
          'Debt already locked at a fixed rate stays put. Only new debt gets pricier.',
        ],
      },
    ],
  },
  {
    id: 'how-a-company-makes-money',
    title: 'How a company makes money',
    field: 'Business',
    summary: 'Follow cash from a customer through costs to what is left.',
    howTo: 'Walk the money from the sale, through the cost of delivering it, to profit and cash.',
    subtopics: [
      {
        id: 'the-sale',
        title: 'The sale',
        beats: [
          'Revenue is what customers pay. It is not yet profit.',
          'A sale counts when the company has earned it, not only when the invoice goes out.',
        ],
      },
      {
        id: 'cost-to-deliver',
        title: 'What it costs to deliver',
        beats: [
          'Some costs rise with each extra unit: materials, delivery, payment fees.',
          'Other costs stay put for a while: rent, salaries, the tools the team already has.',
        ],
      },
      {
        id: 'what-is-left',
        title: 'What is left over',
        beats: [
          'Profit is what remains after the costs of earning that revenue.',
          'A busy company can still lose money if the costs outrun the sales.',
        ],
      },
      {
        id: 'where-the-cash-sits',
        title: 'Where the cash actually sits',
        beats: [
          'Profit on paper is not the same as cash in the bank.',
          'Customers who pay later, and bills due now, decide whether the company can spend.',
        ],
      },
    ],
  },
  {
    id: 'how-the-internet-works',
    title: 'How the internet works',
    field: 'Software',
    summary: 'A request leaves a laptop and comes back as a page.',
    howTo: 'Follow one request from the browser, across the network, to a server, and back.',
    subtopics: [
      {
        id: 'the-address',
        title: 'The address',
        beats: [
          'A name like example.com is looked up and turned into a numeric address.',
          'That lookup is how the browser knows which machine to talk to.',
        ],
      },
      {
        id: 'the-request',
        title: 'The request',
        beats: [
          'The browser sends a short message: which page it wants, and who is asking.',
          'The message hops through networks until it reaches the server that owns the address.',
        ],
      },
      {
        id: 'the-server',
        title: 'The server',
        beats: [
          'A server is a program waiting for those messages.',
          'It decides what to send back: a page, an error, or a redirect.',
        ],
      },
      {
        id: 'the-response',
        title: 'The response',
        beats: [
          'The reply travels back along the same kind of path.',
          'The browser turns that reply into the page you see.',
        ],
      },
    ],
  },
  {
    id: 'unit-economics',
    title: 'Unit economics',
    field: 'Business',
    summary: 'Whether one customer is worth more than they cost.',
    howTo:
      'Price one unit, subtract what it costs to win and serve that customer, then see if the math holds.',
    subtopics: [
      {
        id: 'one-unit',
        title: 'One unit',
        beats: [
          'Pick a single customer, order, or seat. Ignore the whole company for a moment.',
          'Write down what that one unit pays you.',
        ],
      },
      {
        id: 'cost-to-acquire',
        title: 'The cost to acquire',
        beats: [
          'Acquisition cost is what you spend to win that customer: ads, sales time, a trial.',
          'If winning them costs more than they will ever pay, the unit does not work.',
        ],
      },
      {
        id: 'cost-to-serve',
        title: 'The cost to serve',
        beats: [
          'Serving cost is what you spend after they have signed up: support, delivery, hosting.',
          'A cheap signup can still lose money if serving them never stops.',
        ],
      },
      {
        id: 'whether-it-repeats',
        title: 'Whether it repeats',
        beats: [
          'A customer who pays once must cover acquisition in that single payment.',
          'A customer who stays can pay the acquisition cost back over many months.',
        ],
      },
    ],
  },
];

export const getTopic = (id: string) => topics.find((topic) => topic.id === id);
