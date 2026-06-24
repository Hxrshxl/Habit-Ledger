/**
 * Reorder DSA Prep milestones and restart dates from 2026-06-24.
 *
 * New topic order:
 *   Strings → Two Pointers → Sliding Window → Arrays →
 *   Binary Search → Mono Stack → Stack → Recursion →
 *   Linked Lists → HashMap → Trees → Graphs → DP → Other
 *
 * All milestones are reset to status:"pending" (fresh start).
 * Review rows ("Review this week's…") are interleaved on Fridays.
 *
 * USAGE: node scripts/reorder-dsa-plan.mjs [--dry]
 */

import { MongoClient, ObjectId } from "mongodb";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
const DRY = process.argv.includes("--dry");

// ── Env ─────────────────────────────────────────────────────────────────────
function loadEnv() {
  const envPath = resolve(__dir, "../.env.local");
  if (!existsSync(envPath)) return {};
  return Object.fromEntries(
    readFileSync(envPath, "utf8")
      .split("\n")
      .filter((l) => l.includes("=") && !l.startsWith("#"))
      .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
  );
}
const env = loadEnv();
const MONGODB_URI = process.env.MONGODB_URI || env.MONGODB_URI;
if (!MONGODB_URI) { console.error("✗ MONGODB_URI not found."); process.exit(1); }

// ── Topic classification ─────────────────────────────────────────────────────
const TOPIC_PATTERNS = [
  ["STRINGS",       /palindrome|reverse string|backspace string|is subsequence|decode string|remove.*adjacent duplicates|valid parentheses|generate parentheses|score of parentheses|minimum add.*parentheses|simplify path|remove k digits|letter combinations of|group anagrams|sort characters by frequency|add strings|multiply strings|zigzag conversion/i],
  ["TWO_POINTERS",  /two sum ii|3sum|container with most water|sort colors|remove duplicates from sorted/i],
  ["SLIDING_WINDOW",/sliding window|max consecutive ones|fruit into basket|maximum number of vowels|maximum average subarray|minimum size subarray|longest repeating character|longest substring with at most|longest substring without repeating|find all anagrams|permutation in string|minimum window substring|substring with concatenation/i],
  ["ARRAYS",        /range sum query|find pivot index|running sum|product of array except|subarray sum equals k|contiguous array|maximum subarray|maximum sum circular|maximum product subarray|best time to buy|max subarray sum after|majority element|top k frequent|subarray sums divisible|continuous subarray sum/i],
  ["BINARY_SEARCH", /\bbinary search\b|search insert position|sqrt\(x\)|search in rotated sorted|find minimum in rotated|find first and last position|find smallest letter|h-index ii|koko eating|capacity to ship|split array largest|minimum number of days to make|find the smallest divisor|magnetic force between|allocate minimum|median of two|search a 2d matrix|find a peak element/i],
  ["MONO_STACK",    /next greater element|daily temperatures|largest rectangle in histogram|sum of subarray minimums|asteroid collision|online stock span|maximum width ramp|132 pattern/i],
  ["STACK",         /evaluate reverse polish|basic calculator|min stack|implement queue using stacks|implement stack using queues|design a stack with increment|max stack|remove duplicate letters|smallest subsequence of distinct/i],
  ["RECURSION",     /\bfibonacci number\b|climbing stairs|pow\(x,|reverse.*using recursion|sort.*using recursion|delete middle element of a stack|\bsubsets\b|\bsubsets ii\b|^combinations –|merge sort|quick sort|maximum subarray \(d&c\)|different ways to add|combination sum|print all subsequences/i],
  ["LINKED_LISTS",  /linked list|reverse linked|palindrome linked|reorder list|swap nodes in pairs|rotate list|odd even linked|merge two sorted lists|merge k sorted|sort list|insertion sort list|partition list|add two numbers|remove nth node|next greater node in linked|lru cache|flatten.*multilevel doubly|design browser history|all o.one data|insert into a sorted circular|convert binary search tree to sorted doubly|design skiplist|copy list with random pointer/i],
  ["HASHMAP",       /^two sum –.*easy|^majority element –|^top k frequent|sort characters by frequency|group anagrams|subarray sum equals k \(hashmap\)|find all anagrams.*hashmap|minimum window.*hashmap|longest substring.*hashmap|continuous subarray sum|subarray sums divisible by k|contiguous array \(hashmap\)/i],
  ["TREES",         /binary tree inorder|binary tree preorder|binary tree postorder|maximum depth of binary|minimum depth of binary|balanced binary tree|path sum|diameter of binary tree|same tree|symmetric tree|invert binary tree|subtree of another tree|sum root to leaf|level order traversal|binary tree zigzag|binary tree right side view|populating next right|lowest common ancestor|construct binary tree from|serialize and deserialize|convert sorted array to binary search tree|search in a binary search tree|insert into a binary search tree|delete node in a bst|validate binary search tree|kth smallest element in a bst|two sum iv|minimum absolute difference in bst|trim a binary search tree|range sum of bst|closest binary search tree|flatten binary tree to linked/i],
  ["GRAPHS",        /number of islands|rotting oranges|word ladder|01 matrix|walls and gates|course schedule|pacific atlantic water|clone graph|flood fill|snakes and ladders|open the lock|bus routes|jump game.*bfs/i],
  ["DP",            /house robber|min cost climbing stairs|jump game|coin change|longest increasing subsequence|longest common subsequence|edit distance|unique paths|minimum path sum|0.1 knapsack|partition equal subset|target sum|decode ways|word break|palindrome partitioning|burst balloons|regular expression matching/i],
];

const TOPIC_ORDER = [
  "STRINGS", "TWO_POINTERS", "SLIDING_WINDOW", "ARRAYS",
  "BINARY_SEARCH", "MONO_STACK", "STACK", "RECURSION",
  "LINKED_LISTS", "HASHMAP", "TREES", "GRAPHS", "DP", "OTHER",
];

function getTopic(title) {
  if (/review.*solutions|re-attempt/i.test(title)) return "REVIEW";
  for (const [topic, re] of TOPIC_PATTERNS) {
    if (re.test(title)) return topic;
  }
  return "OTHER";
}

// ── Date helpers ─────────────────────────────────────────────────────────────
const pad2 = (n) => String(n).padStart(2, "0");

function parseDateStr(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function fmtDate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function addDays(dateStr, n) {
  const d = parseDateStr(dateStr);
  d.setDate(d.getDate() + n);
  return fmtDate(d);
}

function isWeekend(dateStr) {
  const dow = parseDateStr(dateStr).getDay(); // 0=Sun, 6=Sat
  return dow === 0 || dow === 6;
}

function nextWeekday(dateStr) {
  let d = dateStr;
  while (isWeekend(d)) d = addDays(d, 1);
  return d;
}

function dayOfWeek(dateStr) {
  return parseDateStr(dateStr).getDay(); // 0=Sun,1=Mon,...,5=Fri,6=Sat
}

// ── Assign dates (Mon-Fri, 5/day; Reviews on Friday as 5th slot) ─────────────
function assignDates(ordered, reviews, startDate) {
  const results = []; // { id, target_date, order_index }
  let currentDate = nextWeekday(startDate);
  let slotOnDay = 0;
  const SLOTS_PER_DAY = 5;
  let globalIdx = 0;

  // Merge: on each Friday, after 4 non-review problems, inject a Review.
  // We walk through ordered[] and at every Friday 4th slot we pull one review.
  let reviewIdx = 0;
  let i = 0;

  while (i < ordered.length) {
    const isFriday = dayOfWeek(currentDate) === 5;

    if (slotOnDay === SLOTS_PER_DAY - 1 && isFriday) {
      // Last slot on Friday → inject a Review if available
      if (reviewIdx < reviews.length) {
        results.push({ id: reviews[reviewIdx].id, target_date: currentDate, order_index: globalIdx++ });
        reviewIdx++;
      } else {
        // No review available; use the next problem instead
        results.push({ id: ordered[i].id, target_date: currentDate, order_index: globalIdx++ });
        i++;
      }
    } else if (isFriday && slotOnDay < SLOTS_PER_DAY - 1) {
      // Normal Friday slot (not the last one yet)
      results.push({ id: ordered[i].id, target_date: currentDate, order_index: globalIdx++ });
      i++;
    } else {
      // Mon-Thu or non-last slot
      results.push({ id: ordered[i].id, target_date: currentDate, order_index: globalIdx++ });
      i++;
    }

    slotOnDay++;
    if (slotOnDay >= SLOTS_PER_DAY) {
      slotOnDay = 0;
      let next = addDays(currentDate, 1);
      next = nextWeekday(next);
      currentDate = next;
    }
  }

  // Append leftover reviews at the end (if any)
  while (reviewIdx < reviews.length) {
    results.push({ id: reviews[reviewIdx].id, target_date: currentDate, order_index: globalIdx++ });
    reviewIdx++;
    slotOnDay++;
    if (slotOnDay >= SLOTS_PER_DAY) {
      slotOnDay = 0;
      let next = addDays(currentDate, 1);
      next = nextWeekday(next);
      currentDate = next;
    }
  }

  return results;
}

// ── Main ─────────────────────────────────────────────────────────────────────
const client = new MongoClient(MONGODB_URI);

try {
  await client.connect();
  const db = client.db("habit_ledger");
  const col = db.collection("milestones");

  // Fetch all milestones, sorted by current order_index
  const all = await col.find({}).sort({ order_index: 1 }).toArray();
  console.log(`✓ Fetched ${all.length} milestones`);

  // Classify
  const buckets = Object.fromEntries(TOPIC_ORDER.map((t) => [t, []]));
  buckets["REVIEW"] = [];
  buckets["OTHER"] = buckets["OTHER"] || [];

  const unclassified = [];
  for (const m of all) {
    const topic = getTopic(m.title);
    if (buckets[topic]) {
      buckets[topic].push({ id: m._id.toString(), title: m.title });
    } else {
      buckets["OTHER"].push({ id: m._id.toString(), title: m.title });
    }
  }

  // Print classification summary
  for (const t of [...TOPIC_ORDER, "REVIEW"]) {
    console.log(`  ${t.padEnd(14)} ${buckets[t].length} problems`);
  }

  // Build ordered list (excluding REVIEW — those are interleaved on Fridays)
  const ordered = TOPIC_ORDER.flatMap((t) => buckets[t]);
  const reviews = buckets["REVIEW"];

  console.log(`\n  Total non-review: ${ordered.length}, reviews: ${reviews.length}`);

  // Assign dates
  const assignments = assignDates(ordered, reviews, "2026-06-24");

  if (DRY) {
    console.log("\n── DRY RUN — first 20 assignments ──");
    for (const a of assignments.slice(0, 20)) {
      const m = all.find((x) => x._id.toString() === a.id);
      console.log(`  [${a.order_index}] ${a.target_date}  ${m?.title?.slice(0, 60)}`);
    }
    const dates = [...new Set(assignments.map((a) => a.target_date))];
    console.log(`\n  Spans ${dates.length} dates: ${dates[0]} → ${dates[dates.length - 1]}`);
    console.log("  (no writes — pass without --dry to apply)");
  } else {
    console.log(`\nUpdating ${assignments.length} milestones…`);
    let done = 0;
    for (const a of assignments) {
      await col.updateOne(
        { _id: new ObjectId(a.id) },
        { $set: { target_date: a.target_date, order_index: a.order_index, status: "pending" } }
      );
      done++;
      if (done % 50 === 0) process.stdout.write(`  ${done}/${assignments.length}\r`);
    }
    const dates = [...new Set(assignments.map((a) => a.target_date))];
    console.log(`\n✓ Done. ${done} milestones updated.`);
    console.log(`  Spans ${dates.length} dates: ${dates[0]} → ${dates[dates.length - 1]}`);
    console.log("  All statuses reset to 'pending'. Refresh the app to see the new schedule.");
  }
} finally {
  await client.close();
}
