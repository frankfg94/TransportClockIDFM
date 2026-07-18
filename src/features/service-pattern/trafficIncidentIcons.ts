import type { Component } from "vue";
import {
  CircleAlert,
  CircleX,
  CloudLightning,
  Info,
  Megaphone,
  Settings,
  ShieldAlert,
  TriangleAlert,
  UsersRound,
  Wrench,
} from "lucide-vue-next";
import type { PatternTrafficSummaryIncidentType } from "./trafficCalendarSummary";

export const trafficIncidentIcons: Record<
  PatternTrafficSummaryIncidentType,
  Component
> = {
  interruption: CircleX,
  works: Wrench,
  slowdown: TriangleAlert,
  crowding: UsersRound,
  strike: Megaphone,
  weather: CloudLightning,
  safety: ShieldAlert,
  technical: Settings,
  incident: CircleAlert,
  information: Info,
};
