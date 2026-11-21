import { Phone, MapPin } from 'lucide-react';
import { MandalaMark } from '@/design/indic/motifs/mandala-mark';

const quickLinks = [
    { label: 'Modules', href: '#modules' },
    { label: 'Communication', href: '#communication' },
    { label: 'Use Cases', href: '#use-cases' },
    { label: 'How It Works', href: '#how-it-works' },
    { label: 'Ecosystem', href: '#ecosystem' },
];

export default function Footer() {
    return (
        <footer className="py-16" style={{ background: 'var(--night-ink)', color: 'var(--ivory-cream)' }}>
            <div className="max-w-7xl mx-auto px-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10 mb-12">
                    {/* Brand + ecosystem badge */}
                    <div className="lg:col-span-2">
                        <div className="flex items-center gap-3 mb-6">
                            <MandalaMark size={40} />
                            <span className="text-2xl" style={{ fontFamily: 'var(--font-display)' }}>Vidyaverse</span>
                        </div>
                        <p className="mb-6 max-w-md" style={{ color: 'rgb(var(--ivory-cream-rgb) / 0.72)' }}>
                            The institutional OS for schools, colleges, universities and coaching
                            institutes — 47 modules, one login, built for how Indian institutions
                            actually run.
                        </p>
                        <a
                            href="#ecosystem"
                            className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full transition-colors duration-300"
                            style={{
                                background: 'rgb(var(--ivory-cream-rgb) / 0.05)',
                                border: '1px solid rgb(var(--gold-rgb) / 0.22)',
                            }}
                        >
                            <span
                                className="w-2 h-2 rounded-full"
                                style={{ background: 'linear-gradient(90deg, var(--accent-primary), var(--gold))' }}
                            />
                            <span className="text-xs font-semibold" style={{ color: 'rgb(var(--ivory-cream-rgb) / 0.75)' }}>
                                One login across the <span className="gradient-text-indic-soft font-bold">Vidyaverse</span> trio —
                                AI Tutor via DigiClassroom, Library via PDLMS
                            </span>
                        </a>
                    </div>

                    {/* Quick links */}
                    <div>
                        {/* --gold, not --ink-gold. The footer paints its own --night-ink
                            background in BOTH themes, so the theme-aware ink is wrong here:
                            in light it resolves to a dark amber and measured 2.99:1 on the
                            navy. Same reasoning as the ComparisonSection eyebrow. */}
                        <h3 className="text-lg mb-6" style={{ color: 'var(--gold)' }}>On This Page</h3>
                        <ul className="space-y-3">
                            {quickLinks.map((link) => (
                                <li key={link.href}>
                                    <a
                                        href={link.href}
                                        className="transition-colors duration-300 hover:text-[color:var(--gold)]"
                                        style={{ color: 'rgb(var(--ivory-cream-rgb) / 0.72)' }}
                                    >
                                        {link.label}
                                    </a>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Contact */}
                    <div>
                        <h3 className="text-lg mb-6" style={{ color: 'var(--gold)' }}>Contact</h3>
                        <ul className="space-y-3 text-sm" style={{ color: 'rgb(var(--ivory-cream-rgb) / 0.72)' }}>
                            <li className="flex items-center gap-2">
                                <Phone className="h-4 w-4 shrink-0" style={{ color: 'var(--accent-primary)' }} />
                                <a href="tel:+919310959596" className="transition-colors duration-300 hover:text-[color:var(--gold)]">
                                    +91 93109 59596
                                </a>
                            </li>
                            <li className="flex items-start gap-2">
                                <MapPin className="h-4 w-4 mt-0.5 shrink-0" style={{ color: 'var(--accent-primary)' }} />
                                <span className="leading-tight">
                                    Vinstitution, 2nd Floor, Property No. 44, Regal Building,
                                    Connaught Place, New Delhi — 110001
                                </span>
                            </li>
                        </ul>
                    </div>
                </div>

                {/* Bottom bar */}
                <div className="pt-8" style={{ borderTop: '1px solid rgb(var(--gold-rgb) / 0.14)' }}>
                    <div
                        className="flex flex-col md:flex-row items-center justify-between gap-4 text-sm"
                        style={{ color: 'rgb(var(--ivory-cream-rgb) / 0.6)' }}
                    >
                        <p className="text-center md:text-left leading-relaxed">
                            Vidyaverse is a brand of the Vinstitution segment of VPD Vastus Ventures
                            Private Limited.
                        </p>
                        <div className="flex gap-6">
                            <a href="/login" className="transition-colors duration-300 hover:text-[color:var(--gold)]">Log In</a>
                            <a href="/register" className="transition-colors duration-300 hover:text-[color:var(--gold)]">Get Started</a>
                        </div>
                    </div>

                    {/* Legal identifiers + copyright — same block across the trio, only the brand name above changes */}
                    <div
                        className="mt-6 pt-6 flex flex-col items-center gap-1.5 text-center text-xs"
                        style={{ borderTop: '1px solid rgb(var(--gold-rgb) / 0.1)', color: 'rgb(var(--ivory-cream-rgb) / 0.55)' }}
                    >
                        <p>PAN: AAMCV2938B &middot; GSTIN: 07AAMCV2938B1ZA &middot; ISO 9001:2015 Certified</p>
                        <p>
                            &copy; {new Date().getFullYear()} VPD Vastus Ventures Pvt. Ltd. All rights reserved.
                            &middot; Proudly powered by Vinstitution &middot; Designed by{' '}
                            <a href="https://vgraphics.in" className="transition-colors duration-300 hover:text-[color:var(--gold)]">
                                VGraphics.in
                            </a>
                        </p>
                    </div>
                </div>
            </div>
        </footer>
    );
}
