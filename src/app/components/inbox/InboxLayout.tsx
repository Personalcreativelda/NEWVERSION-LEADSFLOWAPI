import React from 'react';
import { Outlet } from 'react-router-dom';

export default function InboxLayout() {
    return (
        <div className="flex h-full overflow-hidden transition-all duration-300" style={{ backgroundColor: 'hsl(var(--background))' }}>
            <Outlet />
        </div>
    );
}
