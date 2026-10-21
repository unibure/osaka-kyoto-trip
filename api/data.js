import { randomUUID } from 'node:crypto';
import { Redis } from '@upstash/redis';
import { isConfigured, json, originIsSame } from './_shared.js';

const STATE_KEY = 'little-trip:state';

function redis() {
  return Redis.fromEnv();
}

function validDay(day) {
  return Number.isInteger(day) && day >= 0 && day <= 2;
}

function cleanTag(value) {
  return String(value || '').trim().slice(0, 12);
}

function emptyState() {
  return { schedule: { 0: [], 1: [], 2: [] }, packing: [] };
}

function normalizeState(raw) {
  const state = emptyState();
  if (!raw || typeof raw !== 'object') return state;
  for (const day of [0, 1, 2]) {
    const items = Array.isArray(raw.schedule?.[day]) ? raw.schedule[day] : [];
    state.schedule[day] = items
      .filter(item => item && typeof item.id === 'string')
      .map((item, index) => ({
        id: item.id,
        time: String(item.time || '').slice(0, 20),
        title: String(item.title || '').slice(0, 48),
        tag: cleanTag(item.tag),
        note: String(item.note || '').slice(0, 80),
        transit: String(item.transit || '').slice(0, 80),
        order: Number.isFinite(item.order) ? item.order : index,
      }))
      .sort((a, b) => a.order - b.order)
      .map((item, order) => ({ ...item, order }));
  }
  state.packing = (Array.isArray(raw.packing) ? raw.packing : [])
    .filter(item => item && typeof item.id === 'string' && typeof item.name === 'string')
    .map(item => ({ id: item.id, name: String(item.name).slice(0, 40), done: Boolean(item.done) }));
  return state;
}

async function readState() {
  const raw = await redis().get(STATE_KEY);
  return normalizeState(raw);
}

async function writeState(state) {
  // One key overwrite keeps Redis commands minimal on the free tier.
  await redis().set(STATE_KEY, normalizeState(state));
}

export async function GET() {
  if (!isConfigured()) return json({ error: 'setup_required' }, 503);
  try {
    return json(await readState());
  } catch (error) {
    console.error('Trip data read failed:', error);
    return json({ error: 'storage_unavailable' }, 503);
  }
}

export async function POST(request) {
  if (!isConfigured()) return json({ error: 'setup_required' }, 503);
  if (!originIsSame(request)) return json({ error: 'origin_not_allowed' }, 403);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'invalid_json' }, 400); }
  try {
    const state = await readState();

    if (body.kind === 'schedule' && body.action === 'add') {
      const title = typeof body.title === 'string' ? body.title.trim().slice(0, 48) : '';
      if (!title || !validDay(body.day)) return json({ error: 'invalid_schedule' }, 400);
      const dayItems = state.schedule[body.day];
      const order = dayItems.length ? Math.max(...dayItems.map(item => item.order)) + 1 : 0;
      const item = {
        id: randomUUID(),
        time: String(body.time || '').trim().slice(0, 20),
        title,
        tag: cleanTag(body.tag),
        note: String(body.note || '').trim().slice(0, 80),
        transit: String(body.transit || '').trim().slice(0, 80),
        order,
      };
      state.schedule[body.day] = [...dayItems, item];
      await writeState(state);
      return json({ item }, 201);
    }

    if (body.kind === 'schedule' && body.action === 'update' && typeof body.id === 'string') {
      const title = typeof body.title === 'string' ? body.title.trim().slice(0, 48) : '';
      if (!title) return json({ error: 'invalid_schedule' }, 400);
      const foundDay = [0, 1, 2].find(day => state.schedule[day].some(item => item.id === body.id));
      if (foundDay === undefined) return json({ error: 'not_found' }, 404);
      const dayItems = state.schedule[foundDay];
      const index = dayItems.findIndex(item => item.id === body.id);
      const found = dayItems[index];
      const item = {
        ...found,
        time: String(body.time || '').trim().slice(0, 20),
        title,
        tag: cleanTag(body.tag),
        note: String(body.note || '').trim().slice(0, 80),
        transit: String(body.transit || '').trim().slice(0, 80),
      };
      dayItems[index] = item;
      await writeState(state);
      return json({ item });
    }

    if (body.kind === 'schedule' && body.action === 'reorder' && validDay(body.day) && Array.isArray(body.ids)) {
      const dayItems = state.schedule[body.day];
      const byId = new Map(dayItems.map(item => [item.id, item]));
      const knownIds = body.ids.filter(id => typeof id === 'string' && byId.has(id));
      if (!knownIds.length || new Set(knownIds).size !== knownIds.length) {
        return json({ error: 'invalid_order' }, 400);
      }
      const orderedIds = [...knownIds, ...dayItems.map(item => item.id).filter(id => !knownIds.includes(id))];
      state.schedule[body.day] = orderedIds.map((id, order) => ({ ...byId.get(id), order }));
      await writeState(state);
      return json({ saved: true });
    }

    if (body.kind === 'packing' && body.action === 'add') {
      const name = typeof body.name === 'string' ? body.name.trim().slice(0, 40) : '';
      if (!name) return json({ error: 'invalid_item' }, 400);
      const item = { id: randomUUID(), name, done: false };
      state.packing = [...state.packing, item];
      await writeState(state);
      return json({ item }, 201);
    }

    if (body.kind === 'packing' && body.action === 'update' && typeof body.id === 'string') {
      const name = typeof body.name === 'string' ? body.name.trim().slice(0, 40) : '';
      if (!name) return json({ error: 'invalid_item' }, 400);
      const index = state.packing.findIndex(item => item.id === body.id);
      if (index < 0) return json({ error: 'not_found' }, 404);
      const item = { ...state.packing[index], name };
      state.packing[index] = item;
      await writeState(state);
      return json({ item });
    }

    if (body.kind === 'packing' && body.action === 'toggle' && typeof body.id === 'string' && typeof body.done === 'boolean') {
      const index = state.packing.findIndex(item => item.id === body.id);
      if (index < 0) return json({ error: 'not_found' }, 404);
      state.packing[index] = { ...state.packing[index], done: body.done };
      await writeState(state);
      return json({ saved: true });
    }

    if (['schedule', 'packing'].includes(body.kind) && body.action === 'remove' && typeof body.id === 'string') {
      if (body.kind === 'schedule') {
        for (const day of [0, 1, 2]) {
          state.schedule[day] = state.schedule[day].filter(item => item.id !== body.id);
        }
      } else {
        state.packing = state.packing.filter(item => item.id !== body.id);
      }
      await writeState(state);
      return json({ saved: true });
    }

    return json({ error: 'invalid_action' }, 400);
  } catch (error) {
    console.error('Trip data write failed:', error);
    return json({ error: 'storage_unavailable' }, 503);
  }
}
