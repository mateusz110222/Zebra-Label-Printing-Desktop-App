import { Outlet } from "react-router-dom";
import { SidebarView, HeaderView } from "./index";
import React from "react";

export function LayoutView(): React.JSX.Element {
  return (
    <div className="flex h-screen bg-gray-100 dark:bg-slate-900 text-gray-800 dark:text-slate-100 font-sans overflow-hidden">
      <SidebarView />

      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <HeaderView />

        <main className="flex-1 h-full overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
