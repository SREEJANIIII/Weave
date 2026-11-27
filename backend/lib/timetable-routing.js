export function isTimetableQuestion(question) {
  return /\b(timetable|schedule|class|classes|lecture|lectures|dsa|dbms|java|free on (monday|tuesday|wednesday|thursday|friday|saturday|sunday)|what do i have (on|after)|when is my next)\b/i.test(String(question ?? ''));
}
