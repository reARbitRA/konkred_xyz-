import React, { useState, useEffect, lazy, Suspense } from 'react';
import { PageView } from './types.ts';

// Contexts & Hooks
import { useAuth } from './contexts/AuthContext.tsx';

// Layout & Navigation
import Navbar from './components/Navbar.tsx';
import LoadingScreen from './components/LoadingScreen.tsx';
import AuthLoadingScreen from './components/AuthLoadingScreen.tsx';
import EnterGate from './components/EnterGate.tsx';
import JoinNetwork from './components/JoinNetwork.tsx';
import CommandPalette from './components/common/CommandPalette.tsx';
import SystemFooter from './components/SystemFooter.tsx';
import Loader from './components/common/Loader.tsx';

// Eager Page for instant load
import LandingPage from './pages/LandingPage.tsx';
import { PageTransition } from './components/brand/PageTransition.tsx';
import { Cursors } from './components/chalk/ChalkUI.tsx';
import './styles/brutal.css';

// Code-split pages for optimized bundle size & TTI
const FullKonkPage = lazy(() => import('./pages/FullKonkPage.tsx'));
const RedaeyeSandbox = lazy(() => import('./pages/RedaeyeSandbox.tsx'));
const AuditPage = lazy(() => import('./pages/AuditPage.tsx'));
const CataloguePage = lazy(() => import('./pages/CataloguePage.tsx'));
const SuiteDetailPage = lazy(() => import('./pages/SuiteDetailPage.tsx'));
const WorkflowDetailPage = lazy(() => import('./pages/WorkflowDetailPage.tsx'));
import { PricingPage, SprintPage, EnterprisePage, PartnersPage, ValidationPage, KitDetailPage } from './pages/PlatformPages.tsx';
const NotFoundPage = lazy(() => import('./pages/NotFoundPage.tsx'));
const AccountPage = lazy(() => import('./pages/AccountPage.tsx'));
const AcademyPage = lazy(() => import('./pages/AcademyPage.tsx'));
const BlogHub = lazy(() => import('./pages/BlogHub.tsx'));
const ForumPage = lazy(() => import('./pages/ForumPage.tsx'));
const ConsultingPage = lazy(() => import('./pages/ConsultingPage.tsx'));
const DocumentationPage = lazy(() => import('./pages/DocumentationPage.tsx'));
const CareerPage = lazy(() => import('./pages/CareerPage.tsx'));
const ResourcesPage = lazy(() => import('./pages/ResourcesPage.tsx'));
const StyleGuide = lazy(() => import('./pages/StyleGuide.tsx'));
const VerifyEmailPage = lazy(() => import('./pages/VerifyEmailPage.tsx'));
const ContactPage = lazy(() => import('./pages/ContactPage.tsx'));

import { getPathForPage, getPageFromPath } from './utils/routes.ts';

const App: React.FC = () => {
    const auth = useAuth();

    const [isBooting, setIsBooting] = useState(true);
    const [currentPage, setCurrentPage] = useState<PageView>('landing');
    const [productSlug, setProductSlug] = useState<string | undefined>(undefined);
    const [suiteSlug, setSuiteSlug] = useState<string | undefined>(undefined);
    const [transitioning, setTransitioning] = useState(false);
    const firstRouteLoad = React.useRef(true);
    const routeKey = `${currentPage}:${productSlug ?? ''}:${suiteSlug ?? ''}`;

    // Brutalist slab transition on route change (never on first load)
    React.useEffect(() => {
        if (firstRouteLoad.current) { firstRouteLoad.current = false; return; }
        setTransitioning(true);
        const t = setTimeout(() => setTransitioning(false), 640);
        return () => clearTimeout(t);
    }, [routeKey]);
    const [isCmdOpen, setIsCmdOpen] = useState(false);
    const [emailForVerification, setEmailForVerification] = useState<string | null>(null);

    const navigate = (page: PageView, slug?: string) => {
        setCurrentPage(page);
        if (page === 'workflow_detail' || page === 'kit_detail') setProductSlug(slug);
        if (page === 'suite_detail') setSuiteSlug(slug);
        const newPath = getPathForPage(page, slug);
        if (window.location.pathname !== newPath) {
            window.history.pushState({ page, slug }, '', newPath);
        }
        window.scrollTo(0, 0);
    };

    // URL Routing Initialization & PopState Listener
    useEffect(() => {
        const syncRouteFromUrl = () => {
            const match = getPageFromPath(window.location.pathname);
            setCurrentPage(match.page);
            setProductSlug(match.slug);
            setSuiteSlug(match.slug);

            // Intentional redirect for purged/aliased routes: replace URL so
            // the resolved path is visible and the fake page never renders.
            if (match.redirectedFrom) {
                const targetPath = getPathForPage(match.page, match.slug);
                if (window.location.pathname !== targetPath) {
                    window.history.replaceState({ page: match.page, slug: match.slug }, '', targetPath);
                }
            }
        };

        syncRouteFromUrl();

        const handlePopState = () => {
            syncRouteFromUrl();
        };

        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, []);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                setIsCmdOpen(prev => !prev);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const { user } = auth;

    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            if (event.data === 'back_to_base') {
                navigate('landing');
            }
        };
        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, []);

    if (isBooting) return <LoadingScreen onComplete={() => setIsBooting(false)} />;
    if (auth.isLoading) return <AuthLoadingScreen />;

    const isFullScreen = ['enter', 'join_network', 'verify_email', 'landing', 'redaeye', 'redaeye_sandbox', 'catalogue'].includes(currentPage);
    const showFooter = !['enter', 'join_network', 'verify_email', 'redaeye', 'redaeye_sandbox', 'landing', 'catalogue'].includes(currentPage);

    return (
        <div className="min-h-screen bg-void text-metal-light selection:bg-neon-cyan selection:text-black font-sans flex overflow-hidden">
            <div className="chalk-texture" aria-hidden="true" />
            <Cursors />
            <CommandPalette isOpen={isCmdOpen} onClose={() => setIsCmdOpen(false)} onNavigate={navigate} />

            <main className="flex-1 min-h-screen relative w-full overflow-y-auto custom-scrollbar">
                {!isFullScreen && (
                    <Navbar
                        onNavigate={navigate}
                        currentPage={currentPage}
                        user={auth.user}
                        onLogout={async () => { await auth.logout(); navigate('landing'); }}
                        onOpenCmd={() => setIsCmdOpen(true)}
                    />
                )}

                <PageTransition active={transitioning} />
                <div key={routeKey} className={`brutal-rise ${['landing', 'redaeye', 'redaeye_sandbox'].includes(currentPage) ? '' : 'pt-20 md:pt-24 min-h-[calc(100vh-100px)]'}`}>
                    <Suspense fallback={
                        <div className="py-32 flex flex-col items-center justify-center space-y-4">
                            <Loader size={36} label="Initializing Module..." />
                        </div>
                    }>
                        {currentPage === 'landing' && <LandingPage onNavigate={navigate} />}
                        {currentPage === 'fullkonk' && <FullKonkPage />}
                        {currentPage === 'redaeye' && <RedaeyeSandbox onNavigate={navigate} />}
                        {currentPage === 'redaeye_sandbox' && <RedaeyeSandbox onNavigate={navigate} />}
                        {(currentPage === 'forge_audit' || currentPage === 'audit') && <AuditPage onNavigate={navigate} />}
                        {currentPage === 'catalogue' && <CataloguePage onNavigate={navigate} />}
                        {currentPage === 'suite_detail' && (
                            suiteSlug ? <SuiteDetailPage slug={suiteSlug} onNavigate={navigate} /> : <CataloguePage onNavigate={navigate} />
                        )}
                        {currentPage === 'workflow_detail' && (
                            productSlug ? <WorkflowDetailPage slug={productSlug} onNavigate={navigate} /> : <CataloguePage onNavigate={navigate} />
                        )}
                        {currentPage === 'kit_detail' && (
                            productSlug ? <KitDetailPage slug={productSlug} onNavigate={navigate} /> : <CataloguePage onNavigate={navigate} />
                        )}
                        {currentPage === 'pricing' && <PricingPage onNavigate={navigate} />}
                        {currentPage === 'sprint' && <SprintPage onNavigate={navigate} />}
                        {currentPage === 'enterprise' && <EnterprisePage onNavigate={navigate} />}
                        {currentPage === 'partners' && <PartnersPage onNavigate={navigate} />}
                        {currentPage === 'validation' && <ValidationPage onNavigate={navigate} />}
                        {currentPage === 'not_found' && <NotFoundPage onNavigate={navigate} />}
                        {currentPage === 'account' && <AccountPage user={auth.user} onNavigate={navigate} />}
                        {currentPage === 'enter' && <EnterGate onEnter={() => navigate('catalogue')} onBack={() => navigate('landing')} onVerificationNeeded={(email) => { setEmailForVerification(email); navigate('verify_email'); }} />}
                        {currentPage === 'join_network' && <JoinNetwork onNavigate={navigate} onComplete={(email) => { setEmailForVerification(email); navigate('verify_email'); }} />}
                        {currentPage === 'verify_email' && <VerifyEmailPage email={emailForVerification!} onNavigateLogin={() => navigate('enter')} />}
                        {currentPage === 'contact' && <ContactPage onNavigate={navigate} />}
                        {currentPage === 'academy' && <AcademyPage onNavigate={navigate} />}
                        {currentPage === 'intel' && <BlogHub onNavigate={navigate} />}
                        {currentPage === 'network' && <ForumPage onNavigate={navigate} />}
                        {currentPage === 'advisory' && <ConsultingPage onNavigate={navigate} />}
                        {currentPage === 'documentation' && <DocumentationPage onNavigate={navigate} />}
                        {currentPage === 'career' && <CareerPage onNavigate={navigate} />}
                        {currentPage === 'resources' && <ResourcesPage onNavigate={navigate} />}
                        {currentPage === 'style_guide' && <StyleGuide />}
                    </Suspense>
                </div>

                {showFooter && <SystemFooter />}
            </main>
        </div>
    );
};

export default App;
