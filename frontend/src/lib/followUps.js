// Questions to offer after an answer. Each one is something Weave can actually answer with the
// sample data and the offline script, so a follow-up never leads to a dead end.

export const STARTERS = [
  'When is my next meeting?',
  'When did I buy my fridge?',
  'Show me the warranty for my washing machine',
  'What did I do at the gym last week?',
];

export const DAILY = 'What should I follow up on today, and when can I fit in a workout?';
export const SPENDING = 'How much did I spend on food last week, and what was happening on those days?';

const RULES = [
  [/fridge/, ['Is my fridge still under warranty?', 'Show me the warranty for my washing machine']],
  [/washing machine|warrant/, ['When did I buy my fridge?', 'What receipts have I saved?']],
  [/receipt|saved papers|bill/, ['When did I buy my fridge?', 'Show me the warranty for my washing machine']],
  [/meeting|call/, [DAILY, 'What did I do at the gym last week?']],
  [/gym|workout|exercise/, ['When can I fit in a workout today?', 'When is my next meeting?']],
  [/spen[dt]|food|money/, ['When did I buy my fridge?', 'When is my next meeting?']],
  [/follow[\s-]?up|to-?do/, ['When is my next meeting?', SPENDING]],
  [/wishlist|outfit|diwali|wedding|size/, ['Which of my saved outfits are likely to fit me?', 'When is my next meeting?']],
];

export function followUpsFor(question) {
  const q = question.toLowerCase();
  const hit = RULES.find(([re]) => re.test(q));
  const picks = hit ? hit[1] : ['When is my next meeting?', 'When did I buy my fridge?'];
  return picks.filter((p) => p.toLowerCase() !== q.trim().replace(/\?$/, '').concat('?').toLowerCase() && p.toLowerCase() !== q.trim());
}
