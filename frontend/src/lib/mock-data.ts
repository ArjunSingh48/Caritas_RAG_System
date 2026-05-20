export const mockChats = [
  { id: "1", title: "Regional donation analysis", date: "2024-01-15" },
  { id: "2", title: "Q4 volunteer hours", date: "2024-01-12" },
  { id: "3", title: "Budget comparison 2023", date: "2024-01-10" },
];

export const mockDatasets = [
  { id: "1", name: "donations_2024.csv", rows: 1250, columns: 8 },
  { id: "2", name: "volunteers.xlsx", rows: 340, columns: 5 },
];

export const mockDashboards = [
  { id: "1", name: "Donation Overview", date: "2024-01-15" },
  { id: "2", name: "Regional Analysis", date: "2024-01-12" },
  { id: "3", name: "Volunteer Impact", date: "2024-01-08" },
  { id: "4", name: "Budget Summary Q4", date: "2023-12-20" },
  { id: "5", name: "Fundraising Trends", date: "2023-12-15" },
];

export const mockMessages = [
  {
    id: "1",
    role: "user" as const,
    content: "Show me the donation trends by region for 2024",
  },
  {
    id: "2",
    role: "ai" as const,
    content:
      "Based on your donation data, I can see several interesting trends:\n\n**Key Findings:**\n- The **Zurich region** leads with CHF 2.4M in total donations, up 12% from last year\n- **Bern** shows the highest growth rate at 18% year-over-year\n- **Ticino** has seen a slight decline of 3%, primarily in Q3\n\nThe overall trend shows a strong upward trajectory with total donations reaching CHF 8.7M across all regions.",
    hasChart: true,
  },
];

export const mockKPIs = [
  { title: "Total Records", value: "12,458", change: "+8.2%", trend: "up" as const },
  { title: "Average Value", value: "CHF 245", change: "+3.1%", trend: "up" as const },
  { title: "Highest Category", value: "Zurich", change: "CHF 2.4M", trend: "up" as const },
  { title: "Lowest Category", value: "Ticino", change: "-3.0%", trend: "down" as const },
];

export const mockBarData = [
  { name: "Zurich", value: 2400 },
  { name: "Bern", value: 1800 },
  { name: "Basel", value: 1500 },
  { name: "Lucerne", value: 1200 },
  { name: "Ticino", value: 900 },
  { name: "Geneva", value: 1600 },
];

export const mockLineData = [
  { month: "Jan", donations: 1200, volunteers: 340 },
  { month: "Feb", donations: 1350, volunteers: 360 },
  { month: "Mar", donations: 1500, volunteers: 380 },
  { month: "Apr", donations: 1400, volunteers: 400 },
  { month: "May", donations: 1650, volunteers: 420 },
  { month: "Jun", donations: 1800, volunteers: 450 },
];

export const mockPieData = [
  { name: "Individual", value: 45 },
  { name: "Corporate", value: 30 },
  { name: "Foundation", value: 15 },
  { name: "Government", value: 10 },
];

export const mockTableData = [
  { region: "Zurich", donations: "CHF 2,400,000", donors: 3420, avgDonation: "CHF 701" },
  { region: "Bern", donations: "CHF 1,800,000", donors: 2510, avgDonation: "CHF 717" },
  { region: "Basel", donations: "CHF 1,500,000", donors: 1980, avgDonation: "CHF 757" },
  { region: "Lucerne", donations: "CHF 1,200,000", donors: 1650, avgDonation: "CHF 727" },
  { region: "Geneva", donations: "CHF 1,600,000", donors: 2100, avgDonation: "CHF 762" },
];

export const mockDatasetPreview = {
  columns: [
    { name: "donor_id", type: "string" },
    { name: "amount", type: "number" },
    { name: "region", type: "string" },
    { name: "date", type: "date" },
    { name: "category", type: "string" },
  ],
  rows: [
    { donor_id: "D001", amount: 500, region: "Zurich", date: "2024-01-15", category: "Individual" },
    { donor_id: "D002", amount: 1200, region: "Bern", date: "2024-01-16", category: "Corporate" },
    { donor_id: "D003", amount: 250, region: "Basel", date: "2024-01-17", category: "Individual" },
    { donor_id: "D004", amount: 5000, region: "Geneva", date: "2024-01-18", category: "Foundation" },
    { donor_id: "D005", amount: 750, region: "Lucerne", date: "2024-01-19", category: "Individual" },
  ],
};

export const suggestionChips = [
  "Show trends",
  "Compare regions",
  "Find outliers",
  "Top donors",
  "Monthly breakdown",
];
