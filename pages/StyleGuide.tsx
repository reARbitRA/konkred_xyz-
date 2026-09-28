/**
 * OBSIDIAN SIGNAL — living style guide.
 * The design-system contract rendered as a page: tokens, typography,
 * hardware primitives, interaction law and states.
 */
import React from 'react';
import Badge from '../components/common/Badge.tsx';
import { ShoppingBag } from 'lucide-react';
import {
  SectionHead, GhostNumber, Keycap, Stamp, StatusDot,
  SignalButton, DataRow, HazardTape, Panel, MachineLabel,
  SystemTicker, Frame, Rail, InputWell, EmptyState,
} from '../components/system/primitives.tsx';

const SWATCHES: Array<[string, string]> = [
  ['--obsidian', '#0a0908'], ['--carbon', '#0d0c0b'], ['--ash-surface', '#171514'],
  ['--well', '#100e0d'], ['--raised', '#1d1a18'], ['--line', '#2a2624'],
  ['--edge', '#33302e'], ['--ghost', '#3d3835'], ['--faint', '#5c5852'],
  ['--meta', '#7a756d'], ['--dim', '#8a857d'], ['--rest', '#b7b2a9'],
  ['--body', '#eae7e1'], ['--ink', '#f4f1eb'],
  ['--signal-deep', '#8f0010'], ['--signal', '#d60019'], ['--signal-hot', '#ff1a2e'],
];

const StyleGuide: React.FC = () => {
    return (
        <div className="p-6 sm:p-12 space-y-20 max-w-5xl mx-auto">
            <header className="border-b-2 border-void-300 pb-8 relative">
                <GhostNumber value="00" className="right-0 -top-6 text-9xl" />
                <MachineLabel>SYS // DESIGN CONTRACT</MachineLabel>
                <h1 className="text-4xl sm:text-5xl font-display text-clinical-light mt-2">Obsidian Signal</h1>
                <p className="text-ghost font-mono text-sm uppercase tracking-widest mt-2">KONKRED DESIGN SYSTEM v3.0 — BLACKSITE FORGE</p>
            </header>

            <section className="space-y-8">
                <SectionHead index="01" label="TOKENS" title="Color Ladder" />
                <p className="font-prose text-sm text-void-500 max-w-2xl">
                    One accent. Red means machine signal: power, presence, live state, selection,
                    commitment. Everything else rests on a warm neutral ladder over chalk-black canvas.
                    The background never glows.
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
                    {SWATCHES.map(([name, hex]) => (
                        <div key={name} className="border border-void-300">
                            <div className="h-14" style={{ background: hex }} />
                            <div className="p-2 bg-void-100">
                                <div className="font-mono text-[9px] text-clinical font-bold">{name}</div>
                                <div className="font-mono text-[9px] text-void-600 uppercase">{hex}</div>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            <section className="space-y-8">
                <SectionHead index="02" label="TYPE" title="Typographic Grammar" />
                <div className="space-y-6">
                    <div>
                        <p className="text-[10px] font-mono text-ghost uppercase tracking-[0.28em] mb-2">Display (Archivo Black)</p>
                        <h3 className="text-4xl font-display text-clinical-light">Controlled Workflow Products</h3>
                    </div>
                    <div>
                        <p className="text-[10px] font-mono text-ghost uppercase tracking-[0.28em] mb-2">Machine Label (JetBrains Mono)</p>
                        <MachineLabel>STATION 07 // SUPERVISED_PILOT // REV 3.0</MachineLabel>
                    </div>
                    <div>
                        <p className="text-[10px] font-mono text-ghost uppercase tracking-[0.28em] mb-2">Prose (Special Elite)</p>
                        <p className="font-prose text-base text-clinical max-w-xl">
                            Every claim sourced, every output human-reviewed. The catalogue is the
                            product; nothing ships without its evidence sheet.
                        </p>
                    </div>
                    <div>
                        <p className="text-[10px] font-mono text-ghost uppercase tracking-[0.28em] mb-2">Hollow (decorative only)</p>
                        <span className="hollow font-display text-5xl">ARCHIVE</span>
                    </div>
                </div>
            </section>

            <section className="space-y-8">
                <SectionHead index="03" label="CONTROLS" title="Machine Controls" />
                <p className="font-prose text-sm text-void-500 max-w-2xl">
                    At rest, interactive UI is ash-grey. On hover, focus or arm, it ignites.
                </p>
                <div className="flex flex-wrap items-center gap-6">
                    <SignalButton arrow>RUN</SignalButton>
                    <SignalButton variant="ghost">INSPECT LOG</SignalButton>
                    <button className="btn-primary">DEPLOY ▸</button>
                    <Keycap>⌘K</Keycap>
                    <Keycap>ESC</Keycap>
                </div>
                <div className="flex flex-wrap items-center gap-6">
                    <StatusDot label="STANDBY" />
                    <StatusDot live label="LIVE" />
                    <Stamp>VERIFIED</Stamp>
                    <Stamp>NO FAKE CLAIMS</Stamp>
                </div>
            </section>

            <section className="space-y-8">
                <SectionHead index="04" label="BADGES" title="Status Badges" />
                <div className="flex flex-wrap gap-4">
                    <Badge variant="cyan">Verified</Badge>
                    <Badge variant="purple">Deep Signal</Badge>
                    <Badge variant="green">Completed</Badge>
                    <Badge variant="gold">Armed</Badge>
                    <Badge variant="red">Flagged</Badge>
                    <Badge variant="gray">Archived</Badge>
                </div>
            </section>

            <section className="space-y-8">
                <SectionHead index="05" label="PLATES" title="Panels & Evidence" />
                <div className="grid sm:grid-cols-2 gap-6">
                    <Panel className="p-6 space-y-3">
                        <MachineLabel>EVIDENCE SHEET</MachineLabel>
                        <h3 className="font-display text-xl text-clinical-light">Panel Plate</h3>
                        <DataRow label="STATUS" value="PUBLIC_DEMO" />
                        <DataRow label="INPUT → OUTPUT" value="FILE → REPORT" />
                        <DataRow label="REVIEW" value="HUMAN-SUPERVISED" />
                    </Panel>
                    <Panel chamfer className="p-6 k-blueprint space-y-3">
                        <MachineLabel live>COMMAND SURFACE</MachineLabel>
                        <h3 className="font-display text-xl text-clinical-light">Blueprint Grid</h3>
                        <p className="font-prose text-sm text-void-500">
                            Faint red technical grid for diagrams, workflows and system maps.
                        </p>
                        <SignalButton arrow>OPEN</SignalButton>
                    </Panel>
                </div>
                <HazardTape />
            </section>

            <section className="space-y-8">
                <SectionHead index="06" label="STRUCTURE" title="Frames, Rails & Tickers" />
                <Frame label="REGISTRATION FRAME" className="p-8">
                    <p className="font-prose text-sm text-void-500 max-w-lg">
                        Technical container with corner registration brackets and a stamped label.
                        Used for diagrams, evidence attachments and inspection zones.
                    </p>
                </Frame>
                <Rail />
                <div className="border border-void-300 overflow-hidden">
                    <SystemTicker variant="signal" items={['SYSTEM TICKER', '◆', 'FORWARD OPERATIONAL BAND', '◆', 'SIGNAL VARIANT', '◆']} />
                    <SystemTicker variant="meta" items={['REVERSE METADATA BAND', '///', 'META VARIANT', '///', 'MONO 8PX 0.3EM', '///']} />
                </div>
            </section>

            <section className="space-y-8">
                <SectionHead index="07" label="FORMS" title="Input Wells" />
                <div className="grid sm:grid-cols-2 gap-6 max-w-2xl">
                    <InputWell id="sg-node" label="NODE_ID" placeholder="0xA4F2C9" hint="Recessed technical well" />
                    <InputWell id="sg-freq" label="FREQUENCY" defaultValue="88.1" error="Value outside operating range" />
                </div>
            </section>

            <section className="space-y-8">
                <SectionHead index="08" label="STATES" title="Empty States" />
                <EmptyState
                    icon={<ShoppingBag size={24} />}
                    title="No Transactions Found"
                    description="Acquire your first asset to see your transaction history populate here."
                    action={<SignalButton arrow>OPEN CATALOGUE</SignalButton>}
                />
            </section>
        </div>
    );
};

export default StyleGuide;
