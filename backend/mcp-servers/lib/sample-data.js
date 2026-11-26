// Sample data for the Weave demo. It is generated relative to today's date so the demo
// works on any day. None of this is real user data; the UI labels it as sample data.
import { now, isoDate, addDays, lastWeek, shortWeekday } from '../../lib/dates.js';

const T = () => now();
const day = (n) => isoDate(addDays(T(), n));

function event(id, title, date, start, end, extra = {}) {
  return { id, kind: 'event', title, date, start, end, location: '', attendees: [], ...extra };
}

export function calendarEvents() {
  const { start: lm } = lastWeek(T());
  const lw = (n) => isoDate(addDays(lm, n));
  return [
    // Today
    event('evt_standup', 'Team stand-up', day(0), '09:30', '09:45', { location: 'Video call', attendees: ['Aisha', 'Rohan', 'Kabir'] }),
    event('evt_design', 'Design review: onboarding v2', day(0), '11:00', '12:00', { location: 'Studio B', attendees: ['Aisha', 'Rohan'] }),
    event('evt_lunch', 'Lunch with Kabir', day(0), '13:00', '13:45', { location: 'Corner Brew Café' }),
    event('evt_client', 'Client call: Northwind', day(0), '15:30', '16:30', { location: 'Video call', attendees: ['Priya (Northwind)'] }),
    event('evt_focus', 'Focus block: Q4 report', day(0), '16:45', '18:00'),
    event('evt_dinner', "Dinner: Meera's birthday", day(0), '19:30', '21:30', { location: 'Olive Bistro' }),
    // Coming days
    event('evt_planning', 'Sprint planning', day(1), '10:00', '11:00', { location: 'Studio A', attendees: ['Team'] }),
    event('evt_dentist', 'Dentist', day(1), '17:30', '18:15', { location: 'Smile Dental' }),
    event('evt_usability', 'Usability sessions', day(2), '14:00', '17:00', { location: 'Research room', attendees: ['Rohan'] }),
    event('evt_venue', 'Offsite venue walkthrough', day(3), '10:00', '11:00', { location: 'Lakeview Hall' }),
    event('evt_diwali', 'Diwali celebration', day(10), '19:00', '22:00', { location: 'Community Hall', occasion: 'Diwali' }),
    event('evt_wedding', "Aarav's wedding", day(25), '18:00', '23:00', { location: 'The Garden Pavilion', occasion: 'Wedding' }),
    // Last week (context for spending questions)
    event('evt_lw_review', 'Sprint review', lw(0), '16:00', '17:00', { location: 'Studio A' }),
    event('evt_lw_gym', 'Strength session', lw(1), '07:00', '07:45'),
    event('evt_lw_dinner', 'Team dinner: launch', lw(3), '20:00', '22:30', { location: 'The Long Table', attendees: ['Team'] }),
    event('evt_lw_release', 'Release night: v1.8', lw(4), '18:00', '22:00', { location: 'Office' }),
    event('evt_lw_movie', 'Movie night with friends', lw(5), '19:00', '22:30', { location: 'Cinema' }),
    event('evt_lw_grocery', 'Grocery run', lw(6), '11:00', '12:00'),
  ];
}

export function wishlistItems() {
  return [
    { id: 'wish_101', kind: 'wishlist_item', product_name: 'Blue silk saree', brand: 'Saanvi Studio', product_url: 'https://example.test/products/blue-silk-saree', image_url: 'https://example.test/images/blue-saree.jpg', category: 'saree', occasion: 'Diwali', notes: 'Pair with gold earrings.', product_id: 'saanvi-blue-saree', status: 'saved', source: 'sample data' },
    { id: 'wish_102', kind: 'wishlist_item', product_name: 'Black wrap dress', brand: 'Northline', product_url: 'https://example.test/products/black-wrap-dress', image_url: 'https://example.test/images/black-dress.jpg', category: 'dress', occasion: 'Birthday', notes: 'Check sleeve length.', product_id: 'northline-black-wrap', status: 'saved', source: 'sample data' },
    { id: 'wish_103', kind: 'wishlist_item', product_name: 'Block heel sandals', brand: 'Mira Footwear', product_url: 'https://example.test/products/block-heels', image_url: 'https://example.test/images/block-heels.jpg', category: 'footwear', occasion: 'Wedding', notes: 'Comfortable for long events.', product_id: 'mira-block-heels', status: 'saved', source: 'sample data' },
  ];
}

export function sizeProfile() {
  return { id: 'profile_sample_1', kind: 'size_profile', unit: 'cm', measurements: { bust: 88, waist: 70, hips: 96, shoulder: 38, inseam: 76 }, preferred_fit: 'regular', preferred_categories: ['dress', 'tops'], source: 'clearly labelled synthetic sample profile' };
}

export function sizeCharts() {
  const row = (size, bust, waist, hips) => ({ size, measurements: { bust, waist, hips } });
  return [
    { brand: 'Northline', category: 'dress', region: 'IN', unit: 'cm', synthetic: true, requiredMeasurements: ['bust', 'waist', 'hips'], sizes: [row('S', [80, 86], [62, 68], [86, 92]), row('M', [86, 92], [68, 74], [92, 98]), row('L', [92, 98], [74, 80], [98, 104])] },
    { brand: 'Saanvi Studio', category: 'saree', region: 'IN', unit: 'cm', synthetic: true, requiredMeasurements: ['bust', 'waist', 'hips'], sizes: [row('S', [82, 88], [64, 70], [88, 94]), row('M', [88, 94], [70, 76], [94, 100]), row('L', [94, 100], [76, 82], [100, 106])] },
  ];
}

export function notes() {
  const runDays = [0, 2, 4].map((n) => shortWeekday(addDays(T(), n)));
  return [
    {
      id: 'note_team_sync', kind: 'note', title: 'Team sync: mobile launch', updated: day(-1), tags: ['meeting', 'work'],
      body: [
        'Attendees: Aisha, Rohan, Kabir, me',
        '',
        'Decisions',
        `- Ship onboarding v2 behind a flag on ${day(8)}.`,
        '- Keep the pricing page as is until after launch.',
        '',
        'Action items',
        `- [ ] @me Send the revised budget to the design team (by ${shortWeekday(T())})`,
        "- [ ] @me Confirm Friday's venue booking with the events team",
        '- [ ] @Aisha Share the updated onboarding prototype',
        `- [x] @Rohan Book usability sessions for ${shortWeekday(addDays(T(), 2))}`,
      ].join('\n'),
    },
    {
      id: 'note_workout', kind: 'note', title: 'Workout plan', updated: day(-14), tags: ['fitness', 'plan'],
      body: [
        'Goal: an easy 10K by January.',
        '',
        `Runs: ${runDays.join(', ')} — 45 min, easy pace`,
        '- Best window: 18:00–20:00',
        '- Keep 15 minutes free before and after',
        '',
        'Strength: other weekdays — 30 min at home, any time',
      ].join('\n'),
    },
    {
      id: 'note_northwind', kind: 'note', title: 'Northwind call prep', updated: day(0), tags: ['meeting', 'client'],
      body: ['Agenda', '- Timeline for the pilot', '- Data export format', '- Who signs off on the SOW', '', 'Bring the Q3 usage numbers.'].join('\n'),
    },
    {
      id: 'note_q4', kind: 'note', title: 'Q4 report outline', updated: day(-3), tags: ['work'],
      body: ['1. Highlights', '2. Metrics that moved', '3. What we learned', '4. Plan for Q1'].join('\n'),
    },
    {
      id: 'note_books', kind: 'note', title: 'Books to read', updated: day(-20), tags: ['personal'],
      body: ['- The Overstory', '- Four Thousand Weeks', '- Range'].join('\n'),
    },
    {
      id: 'note_trip', kind: 'note', title: 'Weekend trip ideas', updated: day(-10), tags: ['personal', 'travel'],
      body: ['- Coorg homestay', '- Nandi Hills sunrise', '- Mysore palace on a weekday'].join('\n'),
    },
  ];
}

export function tasks() {
  const t = (id, title, due, list, extra = {}) => ({ id, kind: 'task', title, due, list, status: 'open', ...extra });
  return [
    t('t_101', "Confirm Friday's venue booking", day(0), 'Work', { source: 'Team sync' }),
    t('t_102', "Review Rohan's usability plan", day(0), 'Work'),
    t('t_103', 'Send Northwind recap', day(1), 'Work'),
    t('t_104', 'Call landlord about the leak', day(1), 'Home'),
    t('t_105', 'Pay electricity bill', day(2), 'Home'),
    t('t_106', 'Prepare Q4 report draft', day(3), 'Work'),
    t('t_107', 'Renew gym membership', day(5), 'Personal'),
    t('t_108', 'Book passport appointment', day(7), 'Personal'),
    t('t_109', 'Buy running socks', null, 'Personal'),
    t('t_090', 'Book usability sessions', day(-1), 'Work', { status: 'done' }),
    t('t_091', 'Submit expense report', day(-2), 'Work', { status: 'done' }),
  ];
}

export function transactions() {
  const { start: lm } = lastWeek(T());
  const lw = (n) => isoDate(addDays(lm, n));
  const x = (id, date, merchant, amount, category) => ({ id, kind: 'transaction', date, merchant, amount, category });
  return [
    x('txn_01', lw(0), 'Corner Brew Café', 240, 'Dining out'),
    x('txn_02', lw(0), 'Metro card top-up', 500, 'Transport'),
    x('txn_03', lw(1), 'Office canteen', 180, 'Dining out'),
    x('txn_04', lw(2), 'QuickBite (delivery)', 420, 'Food delivery'),
    x('txn_05', lw(2), 'Booknook', 650, 'Shopping'),
    x('txn_06', lw(3), 'The Long Table', 1850, 'Dining out'),
    x('txn_07', lw(3), 'Corner Brew Café', 210, 'Dining out'),
    x('txn_08', lw(4), 'QuickBite (delivery)', 560, 'Food delivery'),
    x('txn_09', lw(4), 'Electricity bill', 1980, 'Bills'),
    x('txn_10', lw(5), 'Cinema snacks', 380, 'Dining out'),
    x('txn_11', lw(5), 'Cab', 310, 'Transport'),
    x('txn_12', lw(6), 'Fresh Basket', 1240, 'Groceries'),
  ];
}
