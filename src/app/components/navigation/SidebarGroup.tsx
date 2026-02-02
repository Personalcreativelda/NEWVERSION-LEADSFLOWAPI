import React, { useState, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

interface SidebarGroupProps {
    label: string;
    icon: any;
    isActive: boolean;
    isExpandedInitial?: boolean;
    children: React.ReactNode;
}

export default function SidebarGroup({
    label,
    icon: Icon,
    isActive,
    isExpandedInitial = false,
    children
}: SidebarGroupProps) {
    const [isExpanded, setIsExpanded] = useState(isExpandedInitial || isActive);

    useEffect(() => {
        if (isActive) {
            setIsExpanded(true);
        }
    }, [isActive]);

    return (
        <li className="relative">
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className={`sidebar-nav-item w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg transition-all duration-75 group ${
                    isActive
                        ? 'bg-[#00C48C] text-white shadow-lg shadow-[#00C48C]/30'
                        : 'hover:bg-white/10'
                }`}
                style={!isActive ? { color: 'hsl(var(--sidebar-foreground))' } : {}}
            >
                <div className="flex items-center gap-3">
                    <Icon className={`sidebar-nav-item-icon w-5 h-5 flex-shrink-0 ${
                        isActive ? 'text-white' : ''
                    }`} />
                    <span className="text-sm font-medium">{label}</span>
                </div>
                <ChevronDown
                    className={`sidebar-nav-item-icon w-4 h-4 transition-transform duration-75 ${
                        isExpanded ? 'rotate-180' : ''
                    } ${
                        isActive ? 'text-white' : ''
                    }`}
                />
            </button>

            <div
                className={`overflow-hidden transition-all duration-75 ease-in-out ${isExpanded ? 'max-h-[500px] opacity-100 mt-1' : 'max-h-0 opacity-0'
                    }`}
            >
                <ul className="pl-6 space-y-0.5 py-1">
                    {children}
                </ul>
            </div>
        </li>
    );
}
