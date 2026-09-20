import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { FKSession, getUserSessions } from '../../services/fullkonk.sessions';
import { getUserProjects } from '../../services/fullkonk.projects';
import { FKProject } from '../../types';

interface Props {
  userId: string;
  activeSessionId: string | null;
  activeProjectId: string | null;
  refreshKey: number;
  onSelect: (session: FKSession) => void;
  onSelectProject: (project: FKProject) => void;
  onNew: () => void;
}

function timeAgo(ms: number): string {
  const minutes = Math.floor((Date.now() - ms) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 1440)}d ago`;
}

const MODE_COLORS: Record<string, string> = {
  fullstack: '#d60019', frontend: '#d60019', backend: '#d60019', review: '#d60019',
};

export default function SessionSidebar({ userId, activeSessionId, activeProjectId, refreshKey, onSelect, onSelectProject, onNew }: Props) {
  const [sessions, setSessions] = useState<FKSession[]>([]);
  const [projects, setProjects] = useState<FKProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError('');
    Promise.all([getUserProjects(userId, 20), getUserSessions(userId, 30)])
      .then(([nextProjects, nextSessions]) => {
        if (!current) return;
        setProjects(nextProjects);
        setSessions(nextSessions);
      })
      .catch(() => { if (current) setError('HISTORY UNAVAILABLE — RETRY'); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [userId, activeSessionId, activeProjectId, refreshKey]);

  return (
    <aside style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0a0908', borderRight: '1px solid #2a2624', fontFamily: '"JetBrains Mono", monospace', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderBottom: '1px solid #171514' }}>
        <span style={{ fontSize: 9, letterSpacing: 3, color: '#5c5852' }}>// WORKSPACE</span>
        <button onClick={onNew} style={{ background: '#d60019', border: 0, color: '#0a0908', fontSize: 9, fontWeight: 700, letterSpacing: 2, padding: '4px 10px', cursor: 'pointer' }}>+ NEW</button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading && <div style={{ padding: 16, fontSize: 9, color: '#5c5852', textAlign: 'center' }}>LOADING...</div>}
        {error && <div style={{ margin: 10, padding: 8, border: '1px solid #d60019', color: '#d60019', fontSize: 8 }}>{error}</div>}
        {!loading && <>
          <div style={{ padding: '10px 12px 6px', color: '#d60019', fontSize: 8, letterSpacing: 2 }}>PROJECTS</div>
          {projects.length === 0 && <div style={{ padding: '6px 12px 12px', color: '#2a2624', fontSize: 9 }}>No saved projects</div>}
          <AnimatePresence>
            {projects.map(project => (
              <motion.button key={project.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={() => onSelectProject(project)} style={{ width: '100%', padding: '9px 12px', textAlign: 'left', background: project.id === activeProjectId ? '#100e0d' : 'transparent', border: 0, borderBottom: '1px solid #0a0908', borderRight: project.id === activeProjectId ? '3px solid #d60019' : '3px solid transparent', cursor: 'pointer' }}>
                <div style={{ color: project.id === activeProjectId ? '#f4f1eb' : '#7a756d', fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.name}</div>
                <div style={{ color: '#3d3835', fontSize: 8, marginTop: 4 }}>{project.files.length} FILES · {timeAgo(project.updatedAt)}</div>
              </motion.button>
            ))}
          </AnimatePresence>
          <div style={{ padding: '14px 12px 6px', color: '#5c5852', fontSize: 8, letterSpacing: 2 }}>SESSIONS</div>
          {sessions.length === 0 && <div style={{ padding: '6px 12px', color: '#2a2624', fontSize: 9 }}>No sessions yet</div>}
          {sessions.map(session => {
            const color = MODE_COLORS[session.mode] || '#5c5852';
            const active = session.id === activeSessionId;
            return <button key={session.id} onClick={() => onSelect(session)} style={{ width: '100%', padding: '9px 12px', textAlign: 'left', background: active ? '#0a0908' : 'transparent', border: 0, borderBottom: '1px solid #0a0908', borderRight: active ? `3px solid ${color}` : '3px solid transparent', cursor: 'pointer' }}>
              <div style={{ color: active ? '#f4f1eb' : '#7a756d', fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{session.title || 'Untitled'}</div>
              <div style={{ color, fontSize: 8, marginTop: 4, textTransform: 'uppercase' }}>{session.mode} · {timeAgo(session.updatedAt)} · {session.files.length} files</div>
            </button>;
          })}
        </>}
      </div>
    </aside>
  );
}
