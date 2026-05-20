interface PlayerPreferencesSectionProps {
  playerType: 'native' | 'custom';
  onPlayerTypeChange: (value: 'native' | 'custom') => void;
}

export default function PlayerPreferencesSection({ playerType, onPlayerTypeChange }: PlayerPreferencesSectionProps) {
  return (
    <div className="pt-6 border-t border-border-subtle">
      <h2 className="text-lg font-medium text-foreground mb-4">Player Preferences</h2>
      <div className="grid grid-cols-2 gap-4">
        <button
          onClick={() => onPlayerTypeChange('custom')}
          className={`p-4 rounded-lg border text-left transition-all ${
            playerType === 'custom'
              ? 'border-foreground bg-surface-strong ring-1 ring-foreground'
              : 'border-border-subtle hover:bg-surface-subtle'
          }`}
        >
          <div className="font-medium text-foreground">Custom Player</div>
          <div className="text-xs text-content-muted mt-1">Enhanced controls, keyboard shortcuts, modern UI.</div>
        </button>
        <button
          onClick={() => onPlayerTypeChange('native')}
          className={`p-4 rounded-lg border text-left transition-all ${
            playerType === 'native'
              ? 'border-foreground bg-surface-strong ring-1 ring-foreground'
              : 'border-border-subtle hover:bg-surface-subtle'
          }`}
        >
          <div className="font-medium text-foreground">Native Player</div>
          <div className="text-xs text-content-muted mt-1">Standard browser player. Better for compatibility on some devices.</div>
        </button>
      </div>
    </div>
  );
}
