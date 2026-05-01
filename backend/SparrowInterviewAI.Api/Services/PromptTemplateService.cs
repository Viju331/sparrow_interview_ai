namespace SparrowInterviewAI.Api.Services;

public class PromptTemplateService
{
    public string QuestionCleaningGuidance =>
        "Normalize the question, remove filler words, preserve technical nouns, and keep only the user-intended ask.";

    public string QuestionClassificationGuidance =>
        "Classify the question as behavioral, coding, system_design, or general based on intent and vocabulary.";

    public string AnswerGuidance =>
        "Generate a concise, speakable answer that uses candidate context when available and stays aligned with the active question type.";

    public string ContextInjectionGuidance =>
        "Use resume, job description, supporting docs, and notes as supporting evidence. Prefer concrete achievements over generic claims.";

    public string CodingSolverGuidance =>
        "Explain the problem, mention assumptions, offer a baseline and an optimized approach, then give concise implementation guidance.";

    public string OcrCleanupGuidance =>
        "Fix line breaks, merge wrapped tokens, remove UI noise, and preserve the meaningful prompt or error message.";

    public string SessionSummaryGuidance =>
        """
        Summarize the interview session with the following clearly labeled sections:
        1. KEY QUESTIONS ASKED — list every distinct question the interviewer asked.
        2. SUGGESTED ANSWERS — for each question, provide the concise answer guidance that was given or should have been given.
        3. WEAK AREAS — identify topics where the candidate struggled, hesitated, or gave incomplete answers.
        4. FOLLOW-UP PREPARATION — specific areas to study or practice before the next round.
        5. ACTION ITEMS — concrete next steps the candidate should take immediately.
        6. SESSION OVERVIEW — a 3-sentence summary of how the session went overall.
        Stay grounded in the provided transcript and notes. Do not invent questions or answers that did not occur.
        """;

    public string BuildBehavioralAnswer(string question, string candidateContext, string? promptModifier)
    {
        return string.Join(
            Environment.NewLine,
            [
                "Use a compact STAR structure.",
                $"Question: {question}",
                string.IsNullOrWhiteSpace(candidateContext) ? "Candidate context: use the user profile and keep the story honest." : $"Candidate context: {candidateContext}",
                string.IsNullOrWhiteSpace(promptModifier) ? "Modifier: keep it concise and natural." : $"Modifier: {promptModifier}"
            ]);
    }

    public string BuildCodingAnswer(string question, string candidateContext, string? promptModifier)
    {
        return string.Join(
            Environment.NewLine,
            [
                "Produce a structured coding interview answer using the exact section delimiters below.",
                "Each section MUST start on its own line with the delimiter exactly as shown.",
                "",
                "===PROBLEM_UNDERSTANDING===",
                "Restate the problem in your own words. Identify input, output, and key constraints.",
                "",
                "===ASSUMPTIONS===",
                "List any clarifying assumptions you would state to the interviewer.",
                "",
                "===BRUTE_FORCE===",
                "Describe the simplest correct approach. State its time and space complexity.",
                "",
                "===OPTIMIZED===",
                "Describe the optimized approach. Explain why it is better. State time and space complexity.",
                "",
                "===COMPLEXITY===",
                "Summarize: Time: O(?) | Space: O(?)",
                "",
                "===CODE===",
                "Provide clean, readable code in the requested language (or a sensible default).",
                "",
                "===DRY_RUN===",
                "Walk through a small example input step by step.",
                "",
                "===EDGE_CASES===",
                "List edge cases as a checklist.",
                "",
                $"Question: {question}",
                string.IsNullOrWhiteSpace(candidateContext) ? "Candidate context: mention relevant past coding work only if it helps." : $"Candidate context: {candidateContext}",
                string.IsNullOrWhiteSpace(promptModifier) ? "Modifier: include complexity and implementation hints." : $"Modifier: {promptModifier}"
            ]);
    }

    public string BuildSystemDesignAnswer(string question, string candidateContext, string? promptModifier)
    {
        return string.Join(
            Environment.NewLine,
            [
                "Frame the answer around requirements, components, data flow, tradeoffs, and scale.",
                $"Question: {question}",
                string.IsNullOrWhiteSpace(candidateContext) ? "Candidate context: keep the design grounded and practical." : $"Candidate context: {candidateContext}",
                string.IsNullOrWhiteSpace(promptModifier) ? "Modifier: keep the answer interview-friendly." : $"Modifier: {promptModifier}"
            ]);
    }
}
