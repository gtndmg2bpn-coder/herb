'use client';
// app/dashboard/page.js

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getBrowserClient } from '../../lib/supabaseBrowser';
import {
  swapMeal,
  markEatingOut,
  setPortions,
  addPantryItems,
  consumePantryItem,
  logSpend,
  logOffPlanIntake,
  logWeight,
} from '../../lib/actions';

const MEALS = ['breakfast', 'lunch', 'dinner'];
const LOCATIONS = ['fridge', 'freezer', 'cupboard'];
const SPEND_CATEGORIES = ['grocery', 'eating_out', 'other'];

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(iso, days) {
  const date = new Date(`${iso}T00:00:00`);
  date.setDate(date.getDate() + days);
  return isoDate(date);
}

function dayLabel(iso) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

function money(pence) {
  if (pence == null) return '—';
  return `£${(Number(pence) / 100).toFixed(2)}`;
}

function poundsToPence(value) {
  if (value === '' || value == null) return null;
  const pounds = Number(value);
  if (!Number.isFinite(pounds) || pounds < 0) return null;
  return Math.round(pounds * 100);
}

function optionalNumber(value) {
  if (value === '' || value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatWeight(weightKg, units) {
  if (weightKg == null) return '—';
  if (units === 'imperial') {
    const totalLb = Number(weightKg) * 2.2046226218;
    const stone = Math.floor(totalLb / 14);
    const pounds = Math.round(totalLb - stone * 14);
    return `${stone} st ${pounds} lb`;
  }
  return `${Number(weightKg).toFixed(1)} kg`;
}

function slotKey(slotDate, meal) {
  return `${slotDate}|${meal}`;
}

export default function DashboardPage() {
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [session, setSession] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [profile, setProfile] = useState(null);
  const [currentWeight, setCurrentWeight] = useState(null);
  const [weightRows, setWeightRows] = useState([]);

  const [planSlots,laneSlots] = useState([]);
