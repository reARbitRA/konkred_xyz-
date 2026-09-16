import React from 'react';
import type { PageView } from '../types.ts';
import Floor from '../floor/ChalkFloor.tsx';

interface Props {
  onNavigate: (page: PageView, slug?: string) => void;
}

/** The catalogue is the physical 36-bench workflow floor. */
const CataloguePage: React.FC<Props> = ({ onNavigate }) => <Floor onNavigate={onNavigate} />;

export default CataloguePage;
