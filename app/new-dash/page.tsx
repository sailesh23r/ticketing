"use client";

import { ChartLineInteractive } from "@/components/chart-line-interactive";
import { ChartPieDonutText } from "@/components/chart-pie";
// import { SectionCards } from "@/components/section-cards";
import { SectionCardsNew } from "@/components/section-cards-new";
import { TopPerformers } from "@/components/top-perfomers";
import { TicketReports } from "@/components/ticket-reports";


export default function DashboardPage() {

  return (

    <>

      <div className="flex flex-col gap-2 py-4 md:gap-4 md:py-6">
        <SectionCardsNew />
        {/* <SectionCards /> */}
        <div className="px-4 lg:px-6 grid gap-2 md:gap-4 grid-cols-[minmax(500px,_1fr)_400px]">
          {/* <ChartAreaInteractive /> */}
          <ChartLineInteractive />

          <div className="space-y-4">
            <ChartPieDonutText />
            <TopPerformers />
          </div>
        </div>
        <div className="px-4 lg:px-6">
          <TicketReports />
        </div>
      </div>

    </>

  );
}