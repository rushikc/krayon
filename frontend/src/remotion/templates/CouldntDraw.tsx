import { theme } from '../theme.ts';

export function CouldntDraw() {
  return (
    <div
      style={{
        position: 'absolute',
        left: 200,
        right: 200,
        top: 240,
        border: `2px solid ${theme.muted}`,
        borderRadius: 20,
        padding: '28px 32px',
        backgroundColor: theme.paper,
        color: theme.muted,
        fontFamily: theme.sans,
        fontSize: 28,
        textAlign: 'center',
      }}
    >
      couldn't draw this part
    </div>
  );
}
