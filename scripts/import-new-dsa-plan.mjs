/**
 * Imports the new structured DSA curriculum into MongoDB.
 * Deletes the old "DSA Prep" goal + all its milestones, then inserts fresh.
 *
 * Topic order (Strings first, Array second):
 *   Strings → Array → Binary Search → Stack → Recursion →
 *   Linked List → Doubly Linked List → HashMap → Tree → BST →
 *   Graph → Heap → Backtracking → Greedy → DP → Trie → Bit Manipulation
 *
 * Schedule: Mon–Fri, 5 items/day.
 *           Friday slot 5 = auto "Review this week's solutions" item.
 * Start date: 2026-06-24 (Wednesday).
 *
 * USAGE:
 *   node scripts/import-new-dsa-plan.mjs --dry    ← preview only
 *   node scripts/import-new-dsa-plan.mjs           ← write to DB
 */

import { MongoClient, ObjectId } from "mongodb";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
const DRY = process.argv.includes("--dry");

function loadEnv() {
  const p = resolve(__dir, "../.env.local");
  if (!existsSync(p)) return {};
  return Object.fromEntries(
    readFileSync(p, "utf8").split("\n")
      .filter(l => l.includes("=") && !l.startsWith("#"))
      .map(l => { const i = l.indexOf("="); return [l.slice(0,i).trim(), l.slice(i+1).trim()]; })
  );
}
const env = loadEnv();
const MONGODB_URI = process.env.MONGODB_URI || env.MONGODB_URI;
if (!MONGODB_URI) { console.error("✗ MONGODB_URI not found in .env.local"); process.exit(1); }

// ── Curriculum ───────────────────────────────────────────────────────────────
const PLAN = [
  // ── 1. STRINGS ──────────────────────────────────────────────────────────
  { topic: "Strings", sub: "Two-Pointer (Palindrome)", problems: [
    "Reverse a String",
    "Valid Palindrome",
    "Valid Palindrome II",
    "Longest Palindromic Substring",
    "Palindromic Substrings",
  ]},
  { topic: "Strings", sub: "Sliding Window (String)", problems: [
    "Find All Anagrams in a String",
    "Longest Substring Without Repeating Characters",
    "Longest Substring with K Uniques",
    "Permutation in String",
    "Minimum Window Substring",
    "Substring with Concatenation of All Words",
  ]},

  // ── 2. ARRAY ─────────────────────────────────────────────────────────────
  { topic: "Array", sub: "Two-Pointer", problems: [
    "Move Zeroes",
    "Two Sum II",
    "3Sum",
    "Sort Colors",
    "Container With Most Water",
    "Trapping Rain Water",
  ]},
  { topic: "Array", sub: "Sliding Window", problems: [
    "Maximum Sum Subarray of Size K",
    "Max Consecutive Ones",
    "Max Consecutive Ones III",
    "Subarray Product Less Than K",
    "Fruits Into Baskets",
    "Minimum Size Subarray Sum",
    "Sliding Window Maximum",
    "Subarray with K Distinct Integers",
  ]},
  { topic: "Array", sub: "Prefix Sum", problems: [
    "Find Pivot Index",
    "Subarray Sum Equals K",
    "Matrix Block Sum",
    "Product of Array Except Self",
    "Continuous Subarray Sum",
    "Subarray Sum Divisible by K",
  ]},
  { topic: "Array", sub: "Kadane's Algorithm", problems: [
    "Maximum Subarray",
    "Maximum Product Subarray",
    "Maximum Sum Circular Subarray",
    "Maximum Absolute Sum of Any Subarray",
    "Largest Sum Contiguous Subarray",
  ]},

  // ── 3. BINARY SEARCH ─────────────────────────────────────────────────────
  { topic: "Binary Search", sub: "Classic Binary Search", problems: [
    "Binary Search",
    "Sqrt(x)",
    "Search Insert Position",
    "Search in Rotated Sorted Array",
    "Find Minimum in Rotated Sorted Array",
    "Find Peak Element",
  ]},
  { topic: "Binary Search", sub: "Lower / Upper Bound", problems: [
    "Find Kth Rotation",
    "Count Occurrences",
    "Ceiling in a Sorted Array",
    "Floor in a Sorted Array",
    "Find First and Last Position of Element",
  ]},
  { topic: "Binary Search", sub: "Binary Search on Answers", problems: [
    "Koko Eating Bananas",
    "Capacity To Ship Packages Within D Days",
    "Min Speed to Arrive on Time",
    "Aggressive Cows",
    "Min Number of Days to Make m Bouquets",
    "Magnetic Force Between Two Balls",
    "Allocate Minimum Number of Pages",
    "Split Array Largest Sum",
  ]},
  { topic: "Binary Search", sub: "Search in 2D Matrix", problems: [
    "Search a 2D Matrix",
    "Search a 2D Matrix II",
    "Kth Smallest Element in Sorted Matrix",
    "Matrix Median",
  ]},

  // ── 4. STACK ─────────────────────────────────────────────────────────────
  { topic: "Stack", sub: "Monotonic Stack", problems: [
    "Next Greater Element I",
    "Next Greater Element II",
    "Daily Temperatures",
    "Online Stock Span",
    "Asteroid Collision",
    "Largest Rectangle in Histogram",
    "Maximal Rectangle",
  ]},
  { topic: "Stack", sub: "Expression Evaluation", problems: [
    "Basic Calculator II",
    "Evaluate Reverse Polish Notation",
    "Decode String",
    "Basic Calculator I",
  ]},
  { topic: "Stack", sub: "Stack Simulation / Undo Operation", problems: [
    "Backspace String Compare",
    "Remove All Adjacent Duplicates",
    "Make the String Great",
    "Minimum String Length After Removing Substrings",
  ]},
  { topic: "Stack", sub: "Parenthesis & Scoring", problems: [
    "Valid Parentheses",
    "Minimum Add to Make Parentheses Valid",
    "Score of Parentheses",
    "Longest Valid Parentheses",
  ]},
  { topic: "Stack", sub: "Stack-Based Design", problems: [
    "Implement Queue using Stacks",
    "Implement Stack using Queues",
    "Min Stack",
    "Max Stack",
    "Design Stack with Increment Operation",
  ]},
  { topic: "Stack", sub: "Stack + Greedy", problems: [
    "Remove K Digits",
    "Remove Duplicate Letters",
    "Smallest Subsequence of Distinct Characters",
    "Minimum Remove to Make Valid Parentheses",
    "Create Maximum Number",
  ]},
  { topic: "Stack", sub: "Recursive Stack", problems: [
    "Delete Middle Element of Stack",
    "Reverse a Stack (Recursive)",
    "Insert at Bottom of Stack",
  ]},

  // ── 5. RECURSION ─────────────────────────────────────────────────────────
  { topic: "Recursion", sub: "Linear Recursion", problems: [
    "Factorial of N",
    "Print 1 to N / N to 1",
    "Check Palindrome (Recursive)",
    "Pow(x, n)",
  ]},
  { topic: "Recursion", sub: "Non-Linear Recursion", problems: [
    "Fibonacci Number",
    "Climbing Stairs",
    "Unique Paths (Recursive)",
    "House Robber / Stickler Thief (Recursive)",
  ]},
  { topic: "Recursion", sub: "Divide & Conquer", problems: [
    "Binary Search (Recursive)",
    "Merge Sort",
    "Quick Sort",
    "Power (xⁿ)",
    "Median of Two Sorted Arrays",
  ]},
  { topic: "Recursion", sub: "Recursion on LinkedList/Stack", problems: [
    "Reverse Linked List (Recursive)",
    "Merge 2 Sorted Lists (Recursive)",
    "Delete Middle of Stack (Recursive)",
    "Reverse Stack (Recursive)",
  ]},
  { topic: "Recursion", sub: "Subsequences", problems: [
    "Generate All Subsets",
    "Subset Sum",
    "Count Subsequences with Given Sum",
  ]},

  // ── 6. LINKED LIST ───────────────────────────────────────────────────────
  { topic: "Linked List", sub: "Basic Operations", problems: [
    "Search in Linked List",
    "Insert at Head / Tail / Nth Position",
    "Delete Head / Tail / Nth Node",
    "Intersection of Two Linked Lists",
    "Design Linked List",
    "Odd-Even Linked List",
  ]},
  { topic: "Linked List", sub: "Fast and Slow Pointers", problems: [
    "Middle of the Linked List",
    "Linked List Cycle",
    "Linked List Cycle II",
    "Remove Nth Node From End",
    "Maximum Twin Sum of a Linked List",
  ]},
  { topic: "Linked List", sub: "Reversal Pattern", problems: [
    "Reverse a Linked List",
    "Palindrome Linked List",
    "Reverse Linked List II",
    "Swap Nodes in Pairs",
    "Rotate List",
    "Reverse Nodes in k-Group",
  ]},
  { topic: "Linked List", sub: "Merge / Sort", problems: [
    "Merge Two Sorted Lists",
    "Remove Duplicates from Sorted List",
    "Sort List",
    "Reorder List",
    "Remove Duplicates from Sorted List II",
    "Partition List",
    "Merge K Sorted Lists",
  ]},
  { topic: "Linked List", sub: "LinkedList with Stack / HashMap", problems: [
    "Add Two Numbers",
    "Add Two Numbers II",
    "Next Greater Node in Linked List",
    "Remove Nodes From Linked List",
    "Copy List with Random Pointer",
  ]},

  // ── 7. DOUBLY LINKED LIST ────────────────────────────────────────────────
  { topic: "Doubly Linked List", sub: "Basic DLL Operations", problems: [
    "Implement Doubly Linked List",
    "Insert a Node in a Doubly Linked List",
    "Delete a Node from a Doubly Linked List",
    "Reverse Doubly Linked List",
    "LRU Cache",
    "LFU Cache",
  ]},
  { topic: "Doubly Linked List", sub: "Merge / Sort / Reorder", problems: [
    "Merge Two Sorted DLLs",
    "Flatten Multilevel DLL",
    "Convert DLL to Binary Tree",
  ]},

  // ── 8. HASHMAP ───────────────────────────────────────────────────────────
  { topic: "HashMap", sub: "Frequency Map / Counting", problems: [
    "Majority Element",
    "Top K Frequent Elements",
    "Sort Characters By Frequency",
    "Task Scheduler (HashMap)",
  ]},
  { topic: "HashMap", sub: "Prefix-Sum with Map", problems: [
    "Subarray Sum Equals K (HashMap)",
    "Continuous Subarray Sum (HashMap)",
    "Subarray Sums Divisible by K (HashMap)",
    "Count Subarrays with Sum K",
  ]},
  { topic: "HashMap", sub: "Sliding Window + HashMap", problems: [
    "Longest Substring Without Repeating Characters (HashMap)",
    "Find All Anagrams in a String (HashMap)",
    "Fruit Into Baskets (HashMap)",
    "Longest Substring with At Most K Distinct Characters",
    "Minimum Window Substring (HashMap)",
  ]},

  // ── 9. TREE ──────────────────────────────────────────────────────────────
  { topic: "Tree", sub: "DFS Traversals", problems: [
    "Inorder Traversal",
    "Preorder Traversal",
    "Postorder Traversal",
    "Same Tree Check",
    "Diameter of Binary Tree",
    "Maximum Depth of Binary Tree",
    "Path Sum",
    "Minimum Height of a Binary Tree",
    "Check if Nodes are Cousins",
    "Print All Nodes at Distance K",
    "Boundary Traversal of a Binary Tree",
    "Vertical Order Traversal",
    "Top View of a Binary Tree",
    "Binary Tree Maximum Path Sum",
    "Binary Tree Cameras",
  ]},
  { topic: "Tree", sub: "BFS / Level-Order", problems: [
    "Binary Tree Level Order Traversal",
    "Binary Tree Zigzag Level Order Traversal",
    "Minimum Depth of Binary Tree",
    "Average of Levels in Binary Tree",
    "Cousins in Binary Tree",
    "Binary Tree Right Side View",
    "Populating Next Right Pointers in Each Node",
  ]},
  { topic: "Tree", sub: "Lowest Common Ancestor", problems: [
    "Lowest Common Ancestor of Binary Tree",
    "Find Distance Between Two Nodes in a Tree",
    "Kth Ancestor of a Tree Node",
  ]},
  { topic: "Tree", sub: "Serialization / Construction", problems: [
    "Invert Binary Tree",
    "Flatten Binary Tree to Linked List",
    "Construct Binary Tree from Preorder & Inorder",
    "Serialize and Deserialize Binary Tree",
  ]},

  // ── 10. BST ──────────────────────────────────────────────────────────────
  { topic: "BST", sub: "BST Operations", problems: [
    "Convert Sorted Array to BST",
    "Search in a BST",
    "Insert into a BST",
    "Validate Binary Search Tree",
    "Delete Node in a BST",
    "Recover BST",
    "Merge 2 BST",
    "Maximum Sum BST in Binary Tree",
    "Kth Smallest Element in BST",
  ]},
  { topic: "BST", sub: "LCA & Range Queries", problems: [
    "Closest Binary Search Tree Value",
    "Lowest Common Ancestor of BST",
    "Closest Leaf in BST",
  ]},

  // ── 11. GRAPH ────────────────────────────────────────────────────────────
  { topic: "Graph", sub: "BFS (Unweighted Path)", problems: [
    "01 Matrix",
    "Clone Graph",
    "Rotting Oranges",
    "Shortest Path in Binary Matrix",
    "Walls and Gates",
    "Word Ladder",
  ]},
  { topic: "Graph", sub: "DFS (Connectivity)", problems: [
    "Flood Fill",
    "Number of Islands",
    "All Paths from Source to Target",
    "Find Eventual Safe States",
    "Count Components in Graph",
    "Surrounded Regions",
    "Is Graph Bipartite",
    "Directed Cycle Detection",
    "Undirected Cycle Detection",
    "Longest Cycle in a Graph",
    "Articulation Points",
    "Bridges in Graph / Critical Connections",
  ]},
  { topic: "Graph", sub: "Topological Sort", problems: [
    "Task Scheduling with Dependencies",
    "Course Schedule",
    "Course Schedule II",
    "Find Eventual Safe States (Topo)",
    "Cycle Detection in Directed Graph",
    "Alien Dictionary",
    "Reconstruct Itinerary",
  ]},
  { topic: "Graph", sub: "MST / Union-Find", problems: [
    "Minimum Spanning Tree",
    "Kruskal's Algorithm",
    "Lexicographically Smallest Equivalent String",
    "Number of Connected Components in Graph",
    "Redundant Connection",
    "Connecting Cities With Minimum Cost",
    "Accounts Merge",
  ]},
  { topic: "Graph", sub: "Dijkstra (Weighted)", problems: [
    "Dijkstra Implementation",
    "Shortest Path in Weighted Graph",
    "Minimum Cost Path in Grid",
    "Network Delay Time",
    "Cheapest Flights Within K Stops",
    "Swim in Rising Water",
    "Path With Minimum Effort",
  ]},
  { topic: "Graph", sub: "Bellman-Ford", problems: [
    "Negative Weight Cycle Detection",
    "Cheapest Flights Within K Stops (Bellman-Ford)",
    "Find the City With Smallest Number of Neighbors at Threshold Distance",
  ]},
  { topic: "Graph", sub: "Floyd-Warshall", problems: [
    "Transitive Closure",
    "All-Pairs Shortest Path",
    "Detect Negative Cycle Using Floyd-Warshall",
  ]},

  // ── 12. HEAP ─────────────────────────────────────────────────────────────
  { topic: "Heap", sub: "Top-K Elements", problems: [
    "K Frequent Words",
    "Sort Characters by Frequency (Heap)",
    "Kth Largest Element in an Array",
    "Top K Frequent Elements",
    "Minimum Cost to Connect Ropes",
    "Find Median from Data Stream",
  ]},
  { topic: "Heap", sub: "Merge K Sorted", problems: [
    "Find K Pairs with Smallest Sums",
    "Merge K Sorted Lists (Heap)",
    "Smallest Range Covering Elements from K Lists",
  ]},
  { topic: "Heap", sub: "Heap with Sliding Window", problems: [
    "Task Scheduler (Heap)",
    "Sliding Window Maximum (Heap)",
    "Sliding Window Median",
  ]},
  { topic: "Heap", sub: "Implementation of Heap", problems: [
    "Implement Priority Queue",
    "Implement Min Heap",
    "Implement Max Heap",
  ]},
  { topic: "Heap", sub: "Huffman Pattern", problems: [
    "Minimum Cost to Connect Sticks",
    "Minimum Cost of Ropes",
    "Merge Files with Minimum Cost",
    "Combine Cards / Numbers with Minimum Cost",
    "Reorganize String",
  ]},

  // ── 13. BACKTRACKING ─────────────────────────────────────────────────────
  { topic: "Backtracking", sub: "Choice-Based Backtracking", problems: [
    "Subsets",
    "Subsets II",
    "Combination Sum",
    "Combination Sum II",
    "Permutations",
    "Permutations II",
    "Generate Parentheses",
    "Palindrome Partitioning",
    "Restore IP Addresses",
  ]},
  { topic: "Backtracking", sub: "Constraint-Based Backtracking", problems: [
    "Graph Coloring (M-Coloring Problem)",
    "Knight's Tour",
    "Partition to K Equal Sum Subsets",
    "Matchsticks to Square",
    "N-Queens",
    "N-Queens II",
  ]},
  { topic: "Backtracking", sub: "Grid / Path Backtracking", problems: [
    "Rat in a Maze",
    "Path with Maximum Gold",
    "Sudoku Solver",
    "Word Search",
    "Unique Paths III",
  ]},
  { topic: "Backtracking", sub: "Decision Tree / Sequence Generation", problems: [
    "Letter Combinations of a Phone Number",
    "All Possible Full Binary Trees",
    "Expression Add Operators",
    "Word Break II",
  ]},

  // ── 14. GREEDY ───────────────────────────────────────────────────────────
  { topic: "Greedy", sub: "Intervals & Reach", problems: [
    "Activity Selection Problem",
    "Merge Intervals",
    "Insert Interval",
    "Non-overlapping Intervals",
    "Meeting Rooms II",
    "Minimum Number of Arrows to Burst Balloons",
    "Jump Game",
    "Jump Game II",
    "Car Pooling / Capacity to Transport",
    "Minimum Number of Taps to Open to Water Garden",
  ]},
  { topic: "Greedy", sub: "Sorting / Local Choice", problems: [
    "Maximum Units on a Truck",
    "Largest Number",
    "Fractional Knapsack",
    "Partition Labels",
    "Minimum Cost to Connect Sticks (Greedy)",
    "Task Scheduler (Greedy)",
    "Minimum Platforms / Resource Allocation",
    "Next Permutation",
    "Candy Distribution",
  ]},

  // ── 15. DYNAMIC PROGRAMMING ──────────────────────────────────────────────
  { topic: "DP", sub: "1D / Linear DP", problems: [
    "Climbing Stairs (DP)",
    "House Robber",
    "Maximum Subarray (DP)",
    "Maximum Product Subarray (DP)",
    "Decode Ways",
  ]},
  { topic: "DP", sub: "2D / Grid DP", problems: [
    "Unique Paths",
    "Unique Paths II",
    "Minimum Path Sum",
    "Maximum Path Sum in Grid",
    "Minimum Falling Path Sum",
    "Dungeon Game",
    "Cherry Pickup",
    "Maximal Square",
  ]},
  { topic: "DP", sub: "DP on Strings", problems: [
    "Longest Common Subsequence",
    "Longest Palindromic Subsequence",
    "Minimum Insertions to Make String Palindrome",
    "Minimum Number of Insertions and Deletions",
    "Edit Distance",
    "Shortest Common Supersequence",
    "Regular Expression Matching",
    "Distinct Subsequences",
    "Palindrome Partitioning II",
    "Scramble String",
  ]},
  { topic: "DP", sub: "DP on Intervals", problems: [
    "Matrix Chain Multiplication",
    "Merge Intervals with Cost",
    "Burst Balloons",
    "Minimum Cost to Merge Stones",
    "Min Cost to Cut a Stick",
    "Evaluate Expression to True (Boolean Parenthesization)",
  ]},
  { topic: "DP", sub: "DP on Trees / DAGs", problems: [
    "Diameter of Binary Tree (DP)",
    "House Robber III",
    "Path Sum III",
    "Binary Tree Maximum Path Sum (DP)",
    "Maximum Sum BST in Binary Tree (DP)",
    "Binary Tree Cameras (DP)",
  ]},
  { topic: "DP", sub: "Knapsack / Subset Sum", problems: [
    "0-1 Knapsack",
    "Partition Equal Subset Sum",
    "Partition with Given Difference",
    "Coin Change",
    "Coin Change II",
    "Target Sum",
    "Combination Sum IV",
  ]},
  { topic: "DP", sub: "DP on Stocks", problems: [
    "Best Time to Buy and Sell Stock",
    "Best Time to Buy and Sell Stock II",
    "Best Time to Buy and Sell Stock with Cooldown",
    "Best Time to Buy and Sell Stock with Transaction Fee",
    "Best Time to Buy and Sell Stock III",
    "Best Time to Buy and Sell Stock IV",
  ]},

  // ── 16. TRIE ─────────────────────────────────────────────────────────────
  { topic: "Trie", sub: "Basic Trie Operations", problems: [
    "Implement Trie (Prefix Tree)",
    "Add and Search Word",
    "Longest Common Prefix",
    "Longest Word in Dictionary",
    "Search Suggestions System",
  ]},
  { topic: "Trie", sub: "Word Break / Segmentation", problems: [
    "Word Break",
    "Replace Words",
    "Concatenated Words",
  ]},
  { topic: "Trie", sub: "Bitwise Trie / XOR", problems: [
    "Maximum XOR of Two Numbers in Array",
    "Bit Manipulation / Subset XOR Problems",
    "Maximum XOR With an Element From Array",
  ]},

  // ── 17. BIT MANIPULATION ─────────────────────────────────────────────────
  { topic: "Bit Manipulation", sub: "Basic Bit Operations", problems: [
    "Missing Number",
    "Number of 1 Bits / Hamming Weight",
    "Alternating Bits",
    "Check Kth Bit is Set or Not",
    "Power of Two",
    "Single Number",
    "Unique Numbers 2",
    "Single Number II",
    "Single Number III",
  ]},
  { topic: "Bit Manipulation", sub: "Subsets / Bitmask", problems: [
    "Subsets (Bitmask)",
    "Subsets II (Bitmask)",
    "Partition to K Equal Sum Subsets (Bitmask)",
  ]},
  { topic: "Bit Manipulation", sub: "Advanced XOR", problems: [
    "Sum of Subset XOR Totals",
    "Maximum XOR of Two Numbers in Array (Advanced)",
    "Subarray XOR Queries / K-th XOR",
    "Maximum XOR With an Element From Array (Advanced)",
  ]},
];

// ── Date helpers ──────────────────────────────────────────────────────────────
const pad2 = n => String(n).padStart(2, "0");

function addDays(dateStr, n) {
  const [y,m,d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m-1, d);
  dt.setDate(dt.getDate() + n);
  return `${dt.getFullYear()}-${pad2(dt.getMonth()+1)}-${pad2(dt.getDate())}`;
}

function dayOfWeek(dateStr) {
  const [y,m,d] = dateStr.split("-").map(Number);
  return new Date(y, m-1, d).getDay(); // 0=Sun,1=Mon,...,5=Fri,6=Sat
}

function nextWeekday(dateStr) {
  let d = dateStr;
  const dow = dayOfWeek(d);
  if (dow === 0) d = addDays(d, 1); // Sun → Mon
  if (dow === 6) d = addDays(d, 2); // Sat → Mon
  return d;
}

function advanceOneDay(dateStr) {
  let d = addDays(dateStr, 1);
  const dow = dayOfWeek(d);
  if (dow === 6) d = addDays(d, 2); // Sat → Mon
  if (dow === 0) d = addDays(d, 1); // Sun → Mon (shouldn't happen but safe)
  return d;
}

// ── Build flat list with dates ────────────────────────────────────────────────
function buildSchedule(plan, startDate) {
  const items = []; // { title, explanation, target_date, order_index }

  // Flatten all problems in topic order
  const problems = [];
  for (const { topic, sub, problems: ps } of plan) {
    for (const p of ps) {
      problems.push({ title: p, explanation: `${sub} · ${topic}` });
    }
  }

  let date = nextWeekday(startDate);
  let slotOnDay = 0;
  const SLOTS = 5;
  let weekReviewDone = false; // track if we've placed a review this week
  let orderIdx = 0;
  let pIdx = 0;

  while (pIdx < problems.length) {
    const dow = dayOfWeek(date);
    const isFriday = dow === 5;

    if (isFriday && slotOnDay === SLOTS - 1) {
      // Last slot on Friday → Review
      items.push({
        title: "Review this week's solutions + re-attempt 1 tough problem cold",
        explanation: "Weekly review",
        target_date: date,
        order_index: orderIdx++,
      });
    } else {
      // Regular problem
      const { title, explanation } = problems[pIdx++];
      items.push({ title, explanation, target_date: date, order_index: orderIdx++ });
    }

    slotOnDay++;
    if (slotOnDay >= SLOTS) {
      slotOnDay = 0;
      date = advanceOneDay(date);
    }
  }

  // If we ended mid-week (not on a Friday review), append remaining reviews
  // to close out the final week
  while (slotOnDay > 0 && slotOnDay < SLOTS) {
    const dow = dayOfWeek(date);
    if (dayOfWeek(date) === 5 && slotOnDay === SLOTS - 1) {
      items.push({
        title: "Review this week's solutions + re-attempt 1 tough problem cold",
        explanation: "Weekly review",
        target_date: date,
        order_index: orderIdx++,
      });
    }
    slotOnDay++;
    if (slotOnDay >= SLOTS) break;
  }

  return items;
}

// ── Main ─────────────────────────────────────────────────────────────────────
const client = new MongoClient(MONGODB_URI);

try {
  await client.connect();
  const db = client.db("habit_ledger");

  const schedule = buildSchedule(PLAN, "2026-06-24");

  // Count by topic
  const topicCounts = {};
  for (const { topic, sub, problems: ps } of PLAN) {
    topicCounts[topic] = (topicCounts[topic] || 0) + ps.length;
  }

  console.log(`\n── New DSA Plan ─────────────────────────────────────────`);
  for (const [t, n] of Object.entries(topicCounts)) {
    console.log(`  ${t.padEnd(20)} ${n} problems`);
  }
  const total = Object.values(topicCounts).reduce((a,b) => a+b, 0);
  const dates = [...new Set(schedule.map(s => s.target_date))];
  console.log(`  ${"Total".padEnd(20)} ${total} problems + ${schedule.length - total} reviews`);
  console.log(`  Spans ${dates.length} weekdays: ${dates[0]} → ${dates[dates.length-1]}`);

  if (DRY) {
    console.log(`\n── DRY RUN — first 25 items ─────────────────────────────`);
    for (const item of schedule.slice(0, 25)) {
      console.log(`  ${item.target_date}  ${item.title.slice(0, 60)}`);
    }
    console.log(`\n  (no writes — remove --dry to apply)`);
    process.exit(0);
  }

  // ── Delete old DSA Prep goal + milestones ──────────────────────────────
  const goalsCol = db.collection("goals");
  const msCol = db.collection("milestones");

  const oldGoal = await goalsCol.findOne({ title: "DSA Prep" });
  if (oldGoal) {
    const deleted = await msCol.deleteMany({ goal_id: oldGoal._id.toString() });
    await goalsCol.deleteOne({ _id: oldGoal._id });
    console.log(`\n✓ Deleted old goal + ${deleted.deletedCount} milestones`);
  } else {
    console.log(`\n  No existing "DSA Prep" goal found — creating fresh`);
  }

  // ── Create new goal ────────────────────────────────────────────────────
  const now = new Date().toISOString();
  const goalResult = await goalsCol.insertOne({
    title: "DSA Prep",
    description: "Structured DSA curriculum: Strings → Array → Binary Search → Stack → Recursion → Linked List → DLL → HashMap → Tree → BST → Graph → Heap → Backtracking → Greedy → DP → Trie → Bit Manipulation",
    category: "Learning",
    status: "active",
    target_date: dates[dates.length - 1],
    created_at: now,
  });
  const goalId = goalResult.insertedId.toString();
  console.log(`✓ Created new goal (id: ${goalId})`);

  // ── Insert milestones ──────────────────────────────────────────────────
  const docs = schedule.map(item => ({
    goal_id: goalId,
    title: item.title,
    explanation: item.explanation,
    estimated_duration: "30",
    order_index: item.order_index,
    dependencies: [],
    success_criteria: "",
    status: "pending",
    target_date: item.target_date,
    created_at: now,
  }));

  const batchSize = 50;
  let inserted = 0;
  for (let i = 0; i < docs.length; i += batchSize) {
    await msCol.insertMany(docs.slice(i, i + batchSize));
    inserted += Math.min(batchSize, docs.length - i);
    process.stdout.write(`  Inserted ${inserted}/${docs.length}\r`);
  }

  console.log(`\n✓ Done. ${inserted} milestones inserted.`);
  console.log(`  Refresh the app — dashboard DSA sub-list now shows Strings problems for ${dates[0]}.`);

} finally {
  await client.close();
}
