import { Navigate, Outlet, useParams } from 'react-router-dom';
import { PaletteScope } from '../paletteContext.tsx';
import { getPreviewPalette } from '../palettes.ts';

export function PalettePreview() {
  const { paletteId } = useParams();
  const palette = paletteId ? getPreviewPalette(paletteId) : undefined;
  if (!palette) return <Navigate to="/" replace />;

  return (
    <PaletteScope palette={palette}>
      <Outlet />
    </PaletteScope>
  );
}
