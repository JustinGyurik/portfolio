// The published essay, surfaced on the "Writing" slide. Plain content here so
// the layout stays simple and the chat KB and the page never drift apart.

export type Block =
  | { type: "h2"; text: string }
  | { type: "p"; text: string }
  | { type: "fig"; text: string };

export const ARTICLE = {
  title: "Robots All the Way Down",
  subtitle: "I Used AI to Build a System That Uses AI to Teach People to Use AI",
  epigraph: "And somewhere in that spiral, things actually started to click.",
  readingTime: "8 min read",
  blocks: [
    { type: "p", text: "Some ideas arrive fully formed. You can point to them, scope them, plan them. They behave." },
    { type: "p", text: "And then there are ideas that don't. They show up as pressure. A pattern you can't unsee. Something that refuses to resolve. This started as one of those." },
    { type: "p", text: "A big part of my work is AI enablement. As the expectation took hold that AI should handle a serious share of a task before anyone touches it manually, the whole thing stopped being theoretical and became directional. Validating, but also more complicated. Because the real question shifts from \"Can we do this?\" to \"How do we actually help people work this way?\"" },
    { type: "p", text: "That gap is where most of the friction lives." },

    { type: "h2", text: "The translation problem" },
    { type: "p", text: "The default approach to AI enablement makes sense on the surface. Give people access to the tools. Show them what's available. Encourage them to explore. Tell them to use AI to figure out what they need next. It sounds empowering. In practice, it quietly assumes something that isn't true: that people already know how to translate their work into something AI can understand." },
    { type: "p", text: "Most people don't. Not because they're not capable, but because they've never had to do that before." },
    { type: "p", text: "For years, people have built up ways of working that live entirely in their heads. Instincts, shortcuts, pattern recognition. They know how to navigate complexity without needing to explain every step of it. But AI doesn't operate on instinct. It operates on input. So when someone opens an AI tool and is told \"just tell it what you need,\" they run into friction almost immediately. What do I actually say? How much detail matters? How do I explain how I think?" },
    { type: "p", text: "The problem isn't the tool. The problem is translation. And that's not something you solve with static content." },

    { type: "h2", text: "The project" },
    { type: "p", text: "I'm a discovery learner. I don't learn well from a distance. I need to build something real, run into what I don't understand, and figure out just enough to keep going. I need friction to make things stick." },
    { type: "p", text: "So I gave myself a constraint: build something I'd be excited to show people in less than two weeks. Not because two weeks is a magic number, but because AI moves fast enough that if you don't push yourself, you stay comfortable. And staying comfortable is how you end up thinking you understand something that you don't." },
    { type: "p", text: "That constraint forced a question that felt either ambitious or slightly unhinged, depending on how you looked at it: what if I used AI to build a system that uses AI to create AI-curated learning experiences to teach people how to use AI?" },
    { type: "p", text: "It's recursive. It sounds like something that should collapse under its own weight." },
    { type: "p", text: "But consider what a project like this would have looked like even five years ago: a team of developers, a UX designer, a learning and development specialist, months of planning cycles before a single pixel rendered. The idea that one person could prototype something functioning, intelligent, and personalized in a matter of days would have been a punchline. Now it was just me, and time, and the question had shifted entirely from \"is this possible?\" to \"how far can I push it?\"" },
    { type: "p", text: "My approach to learning anything complex with AI is pretty straightforward: I start by asking it to explain everything I ever wanted to know about a topic. If something doesn't click on the first pass, I ask it to explain it like I'm five. Then I get progressively more detailed until I find my personal comfort zone. It's not elegant, but it works. You'd be surprised how much ground you can cover when you're not embarrassed to ask the obvious questions." },
    { type: "p", text: "So I opened a blank chat and stopped trying to prompt it correctly. I just started talking. A full stream of everything I wanted this system to be: what I liked about the tools I already used, what drove me crazy about them, how I wanted employees to interact with it, how it needed to meet people exactly where they were without making anyone feel behind. No filtering. No structure. Just everything. And slowly, something started taking shape." },
    { type: "p", text: "I do want to clarify one thing about that brainstorming phase. I wasn't using \"proper\" prompting techniques while I rambled. But the moment I wanted organized, formatted output, I gave it a well-defined prompt that spelled out its role, tone, context, and format." },

    { type: "h2", text: "Functional, but soulless" },
    { type: "p", text: "The first version rendered in about an hour. The buttons worked. The interface was clean. With sample data loaded in, the heatmaps showing capability scores across AI competencies actually looked good. An hour. Something that would have taken a team several months to reach." },
    { type: "p", text: "But it had nothing going on behind the eyes." },
    { type: "p", text: "The activities worked. The logic held. Everything technically did what it was supposed to do. But there was no life in it. It was the kind of experience where you start checking how many pages are left: everything correct, everything clean, none of it actually sticking." },
    { type: "p", text: "And this is where something else showed up that I wasn't expecting. It felt like cheating. Like something this fast shouldn't count as real work. Like I had skipped something important without realizing it." },
    { type: "p", text: "But I've come to think that feeling is actually useful. It's your instincts asking the right question: did you actually do the work? Or did you throw something at AI, skim the response, and move on because it was good enough? Because those are two very different things, and the gap between them is where most people get it wrong. Working with AI at this level isn't passive. It's refining, iterating, starting over when something isn't landing, taking it in a completely different direction when the first path doesn't hold. That's still work. It just looks different than what we're used to." },
    { type: "p", text: "So I stopped hesitating and went deeper. I took everything I knew about how people actually learn: how attention works, how feedback lands, how to guide someone without over-explaining, and pushed it all back into the system. I built a sandbox into the experience where users could actually interact with it. Change things. Break things. Watch how outputs shift in real time. Not read about AI. Work with it." },
    { type: "p", text: "Hours of iteration. Tweaking the voice, the pacing, the feedback loops. Trying to capture that feeling of being sent down a rabbit hole you didn't plan for but can't stop following. The whole time, I was learning: the biggest single acceleration of my own AI knowledge I've ever experienced. Which, given the nature of the project, felt appropriate." },

    { type: "h2", text: "The moment it became real" },
    { type: "p", text: "One activity in the system has learners identify, fix, and test ambiguity in system prompts. A policy assistant answered a question it didn't have enough information to answer accurately. The task was to find and fix the line that caused this behavior." },
    { type: "p", text: "I wasn't gentle. I replaced the ambiguous instruction with something you wouldn't be able to say on network tv. Partly because I thought it was a funny test, but mostly to see if the system was deeply interpreting freeform inputs." },
    { type: "p", text: "I excitedly clicked \"Test my fix\" and waited for chaos to ensue. To my disappointment, the policy assistant simply gave a professional, controlled response letting the user know it did not have adequate information to give an accurate answer. My fix was marked correct. I feared this wasn't a dynamic activity at all and that it just had predetermined responses." },
    { type: "p", text: "Then the feedback arrived. It called out exactly what I'd done, noted my profanity, and explained why the assistant still responded professionally anyway: deeper guardrails. My response, although inappropriate, was enough to make sure the AI did not try to make up an answer." },

    { type: "h2", text: "Where it all connected" },
    { type: "p", text: "The prototype worked. That should have felt like the finish line. Instead it raised a bigger question: what would it take for something like this to actually live inside a real organization, at scale, without becoming a liability?" },
    { type: "p", text: "That question is what changed how I see my own work." },
    { type: "p", text: "I'd always understood, in the abstract, that there was a bigger architecture above my day-to-day. Principles about how things were supposed to connect, how data should move, how AI should be governed. But it floated somewhere above me. It was a set of ideas I nodded at, not something I used." },
    { type: "p", text: "The shift happened when I stopped reading about that architecture and started using AI to map it. Not as a search box, but as an analyst. Which models do we have, and how do they integrate? What are the options for compute and storage? How do the APIs connect? Where does the data live, and who is allowed to touch it? The map kept expanding, and somewhere in there the company stopped feeling like a pile of separate tools and started feeling like a system." },
    { type: "p", text: "The real \"aha\" came when I asked the AI to hold what I was building up against that bigger architecture, directly and concretely. It didn't just explain the principles to me. It took the actual pieces of my prototype and showed me where they fit, where they didn't, and what I'd have to change. Suddenly I wasn't learning about the architecture. I was thinking inside it." },
    { type: "p", text: "And the boundaries snapped into focus. What should be a governed, reusable service that everything shares, versus what is truly specific to my one application. Decisions that used to feel ambiguous (build a custom integration or use the approved one, how to handle permissions, how knowledge gets retrieved and attributed) became obvious. The rules I'd quietly filed under bureaucracy (everything through approved connectors, all AI through one governed path, all knowledge retrieval traceable, every asset versioned) weren't red tape. They were the scaffolding that let the whole system organize itself." },
    { type: "p", text: "Scale, security, and governance stopped being things I would bolt on later. They were the starting conditions. And the organization stopped looking like a patchwork and started revealing itself as something coherent." },

    { type: "h2", text: "What this was really about" },
    { type: "p", text: "The prototype came together in stolen hours. It's not perfect or complete. But it's grounded." },
    { type: "p", text: "And it was never really the point." },
    { type: "p", text: "The point was identifying the real friction. Not the technology, but how people interact with it. How they translate what they know. How they build a working relationship with something that doesn't think like they do." },
    { type: "p", text: "That's what AI enablement actually is." },
    { type: "p", text: "This is still early. It is just a proof of concept. But it answered the quiet question underneath all of it: if it never scales, was it worth it?" },
    { type: "p", text: "Yes." },
    { type: "p", text: "Because I didn't just build something. I finally understood how it all connects. And I got there by asking AI to explain it to me like I was five, then working my way up from there." },
  ] as Block[],
};
