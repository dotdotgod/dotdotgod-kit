# What Should Developers Practice When AI Writes the Code?

**Language:** [한국어 원문](README.md)

As AI generates code, the weight of the skills developers need is changing. Typing code quickly matters less, while understanding the work, evaluating generated code, and managing design and complexity matter more. **Using AI well requires distinguishing the practice that can shrink from the practice that must deepen.**

AI lowers several early barriers on the path to expertise. As a result, what one person can build and attempt expands dramatically. Turning that change into real capability requires training thought and judgment alongside generation speed.

## Typing Speed Matters Less

When developers entered code directly, the ability to translate an idea into exact syntax quickly had a major effect on productivity. Memorizing common syntax and APIs, becoming fluent with editors and shortcuts, and increasing typing speed reduced real working time.

When AI writes the first draft, the time spent entering code falls sharply. A developer can describe a requirement in natural language or request a change against existing code, and AI can produce an implementation across several files. Typing remains useful, but it is moving away from the center of productivity.

```text
before: think → recall syntax and APIs → type → run
now:    think → describe the work → AI generates → review and revise → run
```

The mechanical cost of expressing code has fallen. Understanding what should be built and deciding whether the result is appropriate still take time.

## Understanding the Work Before Coding Becomes Easier

Before implementation begins, developers must understand unfamiliar code and requirements. They find related files, follow call relationships, identify the intent and constraints of the existing design, and estimate the reach of a change. Slow information retrieval can consume much of the time before implementation even starts.

AI compresses this exploration. It can locate relevant parts of a codebase, summarize the roles of several files, explain unfamiliar libraries and concepts, and suggest possible change points. A developer can see the overall shape of a problem sooner.

This resembles an extension of cognition. AI searches a wider field for signals and proposes relationships. The developer uses those candidates to distinguish meaningful differences and select the context needed for the task. Areas that were previously expensive to explore enter a reviewable range.

## Practice Evaluation More Deeply Than Generation

As code generation accelerates, the ability to evaluate the generated result determines productivity and quality. A developer must be able to read the code, explain its behavior, and decide whether it satisfies the requirements, preserves existing contracts, and avoids defects and security risks.

Evaluation goes beyond finding syntax errors. It asks whether the code understood the actual problem, whether responsibilities sit in the right place, whether tests verify important boundaries, and whether the result will remain maintainable.

This practice becomes more important as generated code looks more polished and convincing. Readable expression and sound design are separate qualities. Code that runs and code that can be operated and maintained are also separate outcomes. Developers need the judgment to verify evidence instead of accepting surface-level completeness.

## Design and Complexity Management Become More Valuable

AI can add code quickly. It can continue producing plausible implementations even when direction and boundaries are unclear, allowing complexity to grow just as quickly. As generation becomes cheaper, choosing what to build and where to stop becomes more important.

Good design divides requirements into narrow, explicit responsibilities, limits how far a change can spread, and makes relationships explainable. Complexity management distinguishes present needs from possible future needs, finds where duplication and exceptions accumulate, and chooses what to delete or simplify.

These abilities retain their value in AI-assisted work. Faster generation makes the consequences of design decisions appear sooner and at a larger scale. Good design amplifies AI productivity. Poor design amplifies the complexity AI can produce.

## Distinguish Shrinking Practice from Deepening Practice

| Practice that matters less | Practice that must deepen |
|---|---|
| Typing code and boilerplate quickly | Defining the purpose of the work and its success conditions |
| Memorizing every syntax form and API | Finding information and selecting relevant context |
| Decoding unfamiliar code entirely from scratch | Verifying the explanations and relationships proposed by AI |
| Completing the first implementation draft by hand | Evaluating the behavior and quality of generated code |
| Performing repetitive transformations manually | Managing design boundaries and complexity |

The skills on the left continue to provide useful foundations. Experience writing and debugging code helps build the judgment on the right. The important change is the purpose of practice and the proportion of time invested in each side.

## Lowering a Few Barriers Expands the Possibilities

The path to expertise has included entry costs separate from depth of knowledge. Learning syntax, configuring a development environment, interpreting unfamiliar error messages, and writing repetitive code all slowed early attempts.

AI lowers several of these barriers. It reduces the time from an idea to an executable draft and makes a first result possible in an unfamiliar domain. Developers can run more experiments, small teams can cover a wider product surface, and individuals can approach larger problems.

Lower barriers broaden access to the starting line. Experts can apply their existing knowledge and judgment across a much wider field. This is why productivity and possibility grow together.

## Guard Against Laziness in Thought and Judgment

Immediate answers and code make it easy to accept a result before understanding it. A developer can request implementation before clarifying the requirement, skim generated code, or stop evaluating once tests pass.

When this habit repeats, output speed increases while the ability to structure a problem and detect errors weakens. Time saved through AI should be reinvested in better questions, design review, code reading, and result verification.

Knowing the limits of AI means understanding which errors are possible, checking the evidence required for important decisions, and keeping human responsibility for the result. More capable tools also make skipped judgment more tempting, so deliberate review habits become essential.

## Type Less and Judge More Deeply

Developers in the AI era can move time from entering code to understanding problems, choosing designs, and reviewing results. Lower entry barriers let more people explore greater possibilities, while experts can apply their judgment across a wider range.

The center of practice moves with that change. Typing and memorization receive less emphasis. Problem definition, context selection, code evaluation, design, and complexity management receive more. Understanding this shift lets developers capture AI productivity while keeping ownership of thought and judgment.

> The more code AI writes, the more deeply we must practice deciding what to build, recognizing good code, and knowing what to trust.
