# Voice Training Recording Script

Recording script for GPT-SoVITS voice cloning (`my_voice_v2`).

**Target:** ~22–24 minutes of clean speech  
**Word count:** 3,211 spoken words across 188 lines  
**Timing:** ~20 min at a fast 160 wpm, ~24 min at a natural 145 wpm with pauses  
**Domain:** system design, AWS, DevOps, databases, networking, observability  
**Blocks:** A–M (13 blocks, record one file per block)

---

## Recording guide (do not read aloud)

**Environment**
- Quiet room, no fan / AC / traffic noise
- Same mic, same distance, same position for all blocks
- No background music, no reverb-heavy rooms

**Delivery**
- Use your normal **reel narration energy** — the exact voice you want cloned
- Consistent pace and volume across every block
- Don't whisper, don't shout, don't drift into a tired tone by the end

**Format**
- Record to WAV, mono, 32000 Hz, 16-bit if possible
- One file per block is fine (easier to redo a bad block)
- Leave ~1 second of silence at the start and end of each recording

**Process**
- Take a short break between blocks — but keep the same energy after the break
- If you fumble a sentence, pause, then **re-read the full sentence** cleanly
- Don't edit out natural breaths; just avoid loud mouth noises
- Read punctuation naturally: commas are short pauses, periods are full stops

**Coverage note**  
The script deliberately mixes short punchy lines, long flowing explanations, questions, numbers, and acronyms. This variety is what makes the clone stable — don't skip blocks just because they feel repetitive.

---

## Block A — Hooks and openers

*Short, punchy, high energy. These teach your attention-grabbing delivery.*

Hey, I'm Rushi, and today we're breaking down a system design question that trips up almost everyone.

Can you actually solve this in a real interview?

Stop scrolling. This one concept will change how you think about scaling.

Here's a question I was asked at a product company interview last month.

Most engineers get this wrong on the first try.

Let me show you the mistake I made so you don't repeat it.

This is the architecture diagram everybody draws. And this is why it breaks in production.

If you've ever wondered how your favorite app handles millions of users at once, watch this.

Three minutes. That's all it takes to understand distributed caching.

I want you to pause right here and think about your answer before I continue.

Quick question. What happens when your database becomes the bottleneck?

Today we're designing something that sounds simple but really isn't.

Save this one. You'll need it before your next interview.

Let's build this step by step, and I'll explain every decision along the way.

Alright, let's get into it.

---

## Block B — System design fundamentals

*Medium pace, explanatory. Longer sentences with natural clause breaks.*

Every distributed system eventually forces you to make a trade-off between consistency, availability, and partition tolerance.

You cannot have all three at the same time, and pretending otherwise is how systems fail at scale.

When we talk about horizontal scaling, we mean adding more machines instead of buying a bigger machine.

Vertical scaling is simpler, but there is always a ceiling, and that ceiling arrives faster than you expect.

A load balancer sits in front of your servers and distributes incoming requests across healthy instances.

Round robin is the default strategy, but least connections often performs better when request durations vary a lot.

Stateless services are easier to scale because any server can handle any request without needing local memory.

The moment you store session state on a single machine, you have created a hidden dependency that will hurt you later.

Sharding splits your data across multiple databases based on a partition key, like user ID or region.

Choosing a bad partition key creates hot shards, where one node handles most of the traffic while the others sit idle.

Replication gives you redundancy and read scaling, but it introduces replication lag between the primary and the replicas.

If a user writes data and immediately reads it from a replica, they might not see their own change.

That problem is called read after write consistency, and you solve it by routing those reads back to the primary.

Idempotency means an operation can be repeated safely without changing the result beyond the first application.

Payment systems depend on idempotency keys, because network retries are guaranteed to happen eventually.

Back pressure is what protects your system when producers are faster than consumers.

Without back pressure, your queues grow until memory runs out and everything collapses at once.

Design for failure, because at scale, failure is not an edge case. It is the normal operating condition.

---

## Block C — AWS services

*Lots of acronyms and product names. Read them the way you naturally say them.*

Let's talk about AWS, starting with the services you'll actually use every single day.

EC2 gives you virtual machines, and you control the operating system, the patching, and the scaling groups.

S3 is object storage, and it is durable, cheap, and effectively unlimited for practical purposes.

If you're storing user uploads, logs, or backups, S3 is almost always the right first answer.

Lambda lets you run code without managing servers, and you pay only for the milliseconds you actually consume.

But Lambda has cold starts, execution timeouts, and memory limits, so it is not a universal solution.

DynamoDB is a managed NoSQL database with single digit millisecond latency at basically any scale.

RDS gives you managed relational databases like PostgreSQL, MySQL, and Aurora, with automated backups and failover.

CloudFront is the content delivery network, and it caches your static assets close to your users around the world.

Route 53 handles DNS, health checks, and traffic routing policies like latency based routing and weighted routing.

SQS is a simple queue service, and it decouples your producers from your consumers so neither one blocks the other.

SNS handles pub sub messaging, so a single event can fan out to many subscribers at the same time.

EventBridge routes events between services using rules, which keeps your architecture loosely coupled and easy to extend.

IAM controls who can do what, and the golden rule is always least privilege access.

Never attach an admin policy to a Lambda function just because it was faster during debugging.

CloudWatch collects logs, metrics, and alarms, and it is your first stop when something breaks in production.

VPC is your private network, with subnets, route tables, NAT gateways, and security groups.

Public subnets can reach the internet. Private subnets cannot, and that separation is the foundation of cloud security.

CloudFormation and Terraform let you define all of this as code, so your infrastructure is versioned and reviewable.

ECS and EKS run your containers, with Fargate removing the need to manage the underlying servers entirely.

---

## Block D — DevOps and CI/CD

*Natural, conversational rhythm with lists and short bursts.*

A good deployment pipeline is boring, repeatable, and fast, and that is exactly what you want.

Continuous integration means every commit triggers an automated build and a full test suite.

Continuous delivery means every green build is automatically deployable, even if you choose not to deploy it yet.

Your pipeline should run linting, unit tests, integration tests, and a security scan before anything reaches production.

If your test suite takes forty minutes, developers will stop running it, and quality drops immediately.

Blue green deployment keeps two identical environments, and you switch traffic over once the new version is verified.

Canary releases send a small percentage of traffic to the new version first, maybe one or five percent.

If error rates spike, you roll back automatically before most users ever notice the problem.

Feature flags let you deploy code without releasing the feature, which separates deployment risk from release risk.

Infrastructure as code means no one is clicking around in the console at two in the morning.

Every change goes through a pull request, gets reviewed, and leaves an audit trail behind it.

Docker packages your application with its dependencies so it runs identically on your laptop and in production.

Kubernetes orchestrates those containers, handling scheduling, service discovery, scaling, and self healing.

A readiness probe tells Kubernetes when your pod can accept traffic. A liveness probe tells it when to restart the pod.

Getting those two probes wrong causes restart loops that look like application bugs but are really configuration mistakes.

Secrets never belong in your repository. Use a secrets manager, rotate them regularly, and scope them tightly.

Automate the boring parts, document the tricky parts, and delete the parts nobody uses anymore.

---

## Block E — Databases and caching

*Mix of technical detail and clear explanation.*

Choosing between SQL and NoSQL is not about which one is better. It is about your access patterns.

Relational databases give you joins, transactions, and strong consistency guarantees with ACID properties.

NoSQL databases give you flexible schemas and horizontal scale, but you design around your queries upfront.

An index makes reads dramatically faster and writes slightly slower, so index the columns you actually filter on.

A full table scan on ten million rows will destroy your response times, and your users will feel it instantly.

Connection pooling matters more than people realize, because opening a database connection is surprisingly expensive.

Caching is the single highest impact optimization in most systems, and Redis is usually the tool of choice.

Cache aside is the most common pattern. You check the cache, and on a miss, you read the database and populate it.

Write through caching updates the cache and the database together, which keeps them consistent but adds write latency.

Cache invalidation is genuinely hard, and setting a sensible time to live solves most problems without heroic engineering.

A thundering herd happens when a popular cache key expires and thousands of requests hit the database simultaneously.

You prevent it with request coalescing, jittered expiry times, or a background refresh before the key actually expires.

Denormalization trades storage for speed, and at scale, storage is cheap while latency is expensive.

Always measure before optimizing. The bottleneck is rarely where your intuition says it is.

Run explain on your slow queries. The query planner will tell you exactly what it is doing wrong.

---

## Block F — Networking, security, and reliability

*Steady, slightly serious tone.*

HTTPS encrypts data in transit, but you also need encryption at rest for anything sensitive.

Rate limiting protects your API from abuse, from accidental retry storms, and from that one badly written client.

A token bucket algorithm allows short bursts while still enforcing a sustainable average request rate.

Circuit breakers stop your service from repeatedly calling a dependency that is already failing.

When the circuit is open, you fail fast and return a fallback response instead of waiting for a timeout.

Retries need exponential backoff and jitter, otherwise every client retries at exactly the same moment.

Timeouts should be set explicitly at every layer, because a default of thirty seconds will hold your threads hostage.

Authentication answers who you are. Authorization answers what you're allowed to do. They are not the same thing.

JSON web tokens are stateless and fast, but revoking them before expiry requires extra infrastructure.

Store password hashes with a slow algorithm like bcrypt or argon2, never a fast one, and never plain text.

Validate every input on the server, because client side validation is a user experience feature, not a security control.

The principle of least privilege applies to services just as much as it applies to people.

Assume breach. Design so that compromising one component does not hand over the entire system.

---

## Block G — Observability and incidents

*Calm, narrative delivery with longer sentences.*

You cannot fix what you cannot see, and that is why observability comes before optimization.

Metrics tell you that something is wrong. Logs tell you what happened. Traces tell you where the time actually went.

Distributed tracing follows a single request across every service it touches, which is essential in a microservices architecture.

Structured logging in JSON is far more useful than free text, because you can query it later without regret.

Alert on symptoms that users feel, like elevated error rates and slow response times, not on every CPU spike.

If an alert fires and nobody acts on it, that alert is noise, and noise trains your team to ignore real problems.

Define your service level objectives clearly, then track your error budget against them every single week.

When an incident happens, the first priority is mitigation, not root cause analysis.

Restore service first. Understand the cause afterwards, when the pressure is off and you can think clearly.

Write a blameless postmortem, focus on the systems and processes that allowed the failure, and share it widely.

Every serious outage should produce at least one concrete action item that makes the same failure impossible next time.

---

## Block H — Numbers, units, and acronyms

*Read these clearly and naturally, the way you'd say them in a video.*

We handle roughly fifty thousand requests per second during peak hours.

Our p ninety nine latency dropped from eight hundred milliseconds to under ninety milliseconds.

The cluster runs sixteen nodes with thirty two gigabytes of memory each.

Storage grew from two terabytes to eleven terabytes in about seven months.

We reduced our monthly cloud bill by thirty eight percent without touching a single feature.

The cache hit ratio sits around ninety four percent on a normal weekday.

Availability target is ninety nine point nine nine percent, which gives us about fifty two minutes of downtime per year.

Deploys went from twice a month to around forty times a week.

The build takes four minutes and twenty seconds end to end.

We're on version three point eleven, and the migration to version four starts next quarter.

Common acronyms, spoken naturally: API, CPU, RAM, SQL, HTTP, HTTPS, TCP, UDP, DNS, CDN, VPC, IAM, EC2, S3, RDS, SQS, SNS, ECS, EKS, CI CD, TLS, JSON, YAML, REST, gRPC, ETL, SLA, SLO, RTO, RPO, MFA, VPN, SSH, ARN.

Read as sentences: The API returned a five hundred error. The CDN cached it for one hour. The SSH key expired on Tuesday.

---

## Block I — Questions and rhetorical variety

*These teach question intonation. Let your pitch rise naturally.*

So what actually happens when the primary database goes down?

Have you ever wondered why your deployment works locally but fails in staging?

What would you do if traffic increased by ten times overnight?

Is this really a scaling problem, or is it just an inefficient query?

Why would anyone choose eventual consistency over strong consistency?

Can we solve this without adding another service to the architecture?

How many of you have accidentally deleted a production resource? Be honest.

What's the first thing you check when latency suddenly spikes?

Does this approach still work when the network partitions?

Where exactly is the single point of failure in this diagram?

Which one would you pick, and more importantly, could you defend that choice in an interview?

---

## Block J — Longer flowing explanations

*This block matters most for prosody. Read it smoothly, like you're teaching.*

Let's walk through a complete example, because theory only gets you so far, and the details are where interviews are actually won or lost.

Imagine we're designing a notification system that has to deliver messages to millions of users across push, email, and SMS, all with different reliability guarantees and different latency expectations.

The first thing I would do is separate the write path from the delivery path, because those two things scale very differently and they fail for very different reasons.

When a service wants to send a notification, it publishes an event to a message queue, and that call returns immediately, so the calling service never waits on a slow email provider.

A pool of worker processes consumes from that queue, looks up the user's notification preferences, and decides which channels to actually use for this specific message.

Each channel has its own worker pool and its own rate limits, because your SMS provider might allow one hundred messages per second while your push service comfortably handles ten thousand.

If a delivery attempt fails, the message goes back onto the queue with an exponential backoff, and after a fixed number of attempts it lands in a dead letter queue for manual inspection.

We store the delivery status in a database so users can see their notification history, and so support engineers can answer the question, did this person actually receive the message.

For deduplication, every notification carries an idempotency key, which means a retried request never produces two identical messages in someone's inbox.

Now, the interesting part is what happens during a traffic spike, like a product launch or a breaking news event, where a single trigger fans out to millions of recipients at once.

You do not want that burst to starve your regular transactional notifications, like password resets, which are far more time sensitive than a marketing announcement.

So you separate the queues by priority, give the high priority queue dedicated workers, and let the bulk queue drain more slowly during peak load.

That single design decision, priority separation, is the difference between a system that degrades gracefully and one that falls over completely under pressure.

And that's really the theme across everything we've talked about today. Good architecture isn't about avoiding failure. It's about deciding, in advance, exactly how your system will behave when things go wrong.

---

## Block K — Trade-offs and real world scenarios

*Conversational, like you're arguing a point with a colleague.*

Microservices are not automatically better than a monolith, and anyone who tells you otherwise is selling something.

A well structured monolith with clear module boundaries will outperform a badly designed microservice architecture every single time.

You split a service when the team boundaries, the scaling needs, or the deployment cadence genuinely demand it.

Splitting too early gives you all the operational complexity of distributed systems with none of the actual benefits.

Every network call between services is a new failure mode, a new latency source, and a new thing to monitor.

Synchronous communication is simple to reason about, but it couples the availability of both services together.

If service A calls service B directly, and service B is down, then service A is effectively down too.

Asynchronous messaging breaks that coupling, but now you're dealing with eventual consistency and out of order delivery.

Exactly once delivery is mostly a myth. What you really get is at least once delivery plus idempotent consumers.

Event sourcing stores every state change as an immutable event, which gives you a perfect audit log for free.

The downside is that rebuilding state from millions of events is slow, so you add snapshots and now it's complicated.

CQRS separates your read model from your write model, which is powerful when those two workloads look nothing alike.

But if your read and write patterns are similar, CQRS just doubles your code for no measurable benefit.

Here's a real scenario. Traffic tripled after a marketing campaign, and response times went from ninety milliseconds to four seconds.

The instinct is to add more servers, but adding servers made it worse, because every new server opened more database connections.

The actual fix was connection pooling and a read replica, and the whole thing took about an hour once we found it.

Another one. A nightly batch job started failing silently, and nobody noticed for eleven days.

There was no alert on job completion, only on job errors, and the job was exiting with a zero status code.

The lesson there is simple. Alert on the absence of success, not just on the presence of failure.

One more. We had a memory leak that only appeared in production, never in staging.

Staging restarted every night as part of the deploy, which quietly hid the leak for almost four months.

Small environment differences create the bugs that are hardest to find, so keep your environments as close as you reasonably can.

Every architecture decision is a trade-off. Your job is to make that trade-off consciously, and to write down why.

---

## Block L — Everyday and phonetic balance

*Not tech. This fills in phoneme coverage that jargon misses. Read naturally.*

The weather this morning was surprisingly cold, so I made an extra cup of coffee before starting work.

She asked whether the meeting could move to Thursday afternoon instead of Wednesday evening.

We walked through the old neighborhood, past the bakery, the bookstore, and that little garden near the corner.

Please bring the blue folder, the yellow notebook, and anything else you think might be useful.

He laughed, shook his head, and said that was easily the strangest thing he'd heard all year.

The train arrives at eleven fifteen, which gives us about twenty minutes to grab something to eat.

I genuinely enjoyed that film, although the ending felt rushed and a little unearned.

Would you mind repeating that? The connection dropped for a second and I missed the last part.

Thank you so much for your patience. I really appreciate you sticking with me through all of this.

Honestly, the hardest part wasn't the work itself. It was figuring out where to begin.

Sometimes the simplest solution is the right one, even when it feels almost too obvious.

There's a quiet satisfaction in finally understanding something that confused you for months.

---

## Block M — Outros and calls to action

*Your signature closers. Keep the energy up — don't fade out.*

And that's how you design a system that actually scales.

Hey, I'm Rushi. If you liked this, save it and follow me for more tech content.

Drop a comment if you want me to break down the next part in more detail.

That's it for today. Try explaining this out loud once, and you'll remember it forever.

If this helped even a little, share it with someone preparing for interviews right now.

More system design breakdowns coming every week. See you in the next one.

Thanks for watching, and good luck with your next interview.

---

## After recording

1. Export as WAV, mono, 32000 Hz, 16-bit
2. Verify no background music or noise
3. Place files in a single folder
4. Then run: merge → slice into ~8s clips → ASR → review transcripts → format → train

See [`voice-training-cmd.md`](./voice-training-cmd.md) for the exact commands.
