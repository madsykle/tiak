// Settings management and persistence

import { AppSettings, SyncStatus } from './types';

const SETTINGS_STORAGE_KEY = 'tiak_settings';

// Default settings
const defaultSettings: AppSettings = {
  maxConcurrent: 2,
  syncDestination: 'onedrive:others/Edits',
  syncMode: 'copy',
  playerType: 'custom',
};

// Load settings from localStorage
export function loadSettings(): AppSettings {
  try {
    const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return { ...defaultSettings, ...parsed };
    }
  } catch (error) {
    console.error('Failed to load settings:', error);
  }
  return defaultSettings;
}

// Save settings to localStorage
export function saveSettings(settings: Partial<AppSettings>): void {
  try {
    const current = loadSettings();
    const updated = { ...current, ...settings };
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(updated));
  } catch (error) {
    console.error('Failed to save settings:', error);
  }
}

// Sync status helpers
export const defaultSyncStatus: SyncStatus = {
  status: 'idle',
  lastRun: null,
  logs: [],
  error: null,
  unsyncedCount: 0,
};

// Player preferences (separate from settings for backward compatibility)
export function loadPlayerPreference(): 'native' | 'custom' {
  try {
    const stored = localStorage.getItem('player_preference');
    if (stored === 'native' || stored === 'custom') {
      return stored;
    }
  } catch (error) {
    console.error('Failed to load player preference:', error);
  }
  return 'custom';
}

export function savePlayerPreference(playerType: 'native' | 'custom'): void {
  try {
    localStorage.setItem('player_preference', playerType);
  } catch (error) {
    console.error('Failed to save player preference:', error);
  }
}