"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { jget } from "@/lib/client";
import type { Habit, Goal, Milestone } from "@/lib/core";

interface AppDataCtx {
  habits: Habit[];          // all habits including archived
  goals: Goal[];
  milestones: Milestone[];
  appLoading: boolean;
  setHabits: React.Dispatch<React.SetStateAction<Habit[]>>;
  setGoals: React.Dispatch<React.SetStateAction<Goal[]>>;
  setMilestones: React.Dispatch<React.SetStateAction<Milestone[]>>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AppDataCtx>({
  habits: [], goals: [], milestones: [], appLoading: true,
  setHabits: () => {}, setGoals: () => {}, setMilestones: () => {},
  refresh: async () => {},
});

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [appLoading, setAppLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [h, g, m] = await Promise.all([
        jget<Habit[]>("/api/habits?all=1"),
        jget<Goal[]>("/api/goals"),
        jget<Milestone[]>("/api/milestones"),
      ]);
      setHabits(h);
      setGoals(g);
      setMilestones(m);
    } catch { /* ignore — pages fall back to their own fetches */ }
    setAppLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <Ctx.Provider value={{ habits, goals, milestones, appLoading, setHabits, setGoals, setMilestones, refresh }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAppData() {
  return useContext(Ctx);
}
