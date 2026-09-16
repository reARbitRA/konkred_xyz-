import React, { useEffect, useState } from 'react';
import { Binary } from 'lucide-react';
import { KonkredLogo } from './brand/KonkredLogo.tsx';

interface LoadingScreenProps { onComplete: () => void; }

/** A brief mechanical boot screen that uses the same floor signal grammar. */
const LoadingScreen: React.FC<LoadingScreenProps> = ({ onComplete }) => {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('SEATING RIVETS');
  useEffect(() => {
    const interval = window.setInterval(() => setProgress(previous => {
      if (previous >= 100) { window.clearInterval(interval); window.setTimeout(onComplete, 260); return 100; }
      return Math.min(previous + 10, 100);
    }), 45);
    const lines = ['SEATING RIVETS', 'LOADING BENCHES', 'CHECKING RAILS', 'OPENING THE FLOOR'];
    let line = 0;
    const statusTimer = window.setInterval(() => { line = (line + 1) % lines.length; setStatus(lines[line]); }, 180);
    return () => { window.clearInterval(interval); window.clearInterval(statusTimer); };
  }, [onComplete]);

  return <div className="boot-screen chalk-smudge">
    <div className="hazard" />
    <div className="boot-content">
      <KonkredLogo size={74} />
      <p className="machine-label">KONKRED / CONTROLLED FLOOR BOOT</p>
      <div className="boot-readout"><span><Binary size={15} /> {status}<i className="cursor-blink" /></span><b>{progress}%</b></div>
      <div className="boot-bar"><i style={{ width: `${progress}%` }} /></div>
      <p className="machine-label boot-foot">36 BENCHES / 06 ZONES / HUMAN-OWNED OUTPUTS</p>
    </div>
  </div>;
};

export default LoadingScreen;
