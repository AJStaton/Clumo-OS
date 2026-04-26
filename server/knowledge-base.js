// Knowledge Base for Clumo
// Local storage with default fallback

const storage = require('./storage');

// Returns the knowledge base: user-generated if available, default otherwise
async function getKnowledgeBase() {
  try {
    const data = storage.loadKB();
    if (data && data.caseStudies && data.discoveryQuestions && data.proofPoints) {
      return data;
    }
  } catch (e) {
    console.error('Error loading knowledge base, falling back to default:', e.message);
  }
  return defaultKnowledgeBase;
}

// Check if a user-generated knowledge base exists
async function hasUserKnowledgeBase() {
  return storage.hasKB();
}

const defaultKnowledgeBase = {
  
  // ============================================
  // CASE STUDIES
  // Add your customer success stories here
  // ============================================
  caseStudies: [
    {
      id: "cs1",
      company: "Astronomer",
      headline: "Azure Powers Data Pipelines",
      problem: "Data engineers struggled to deliver data reliably and at scale, with limited flexibility in pipeline development.",
      solution: "Partnered with Microsoft Azure to launch Astro as the exclusive Airflow service, providing a fully managed data orchestration platform.",
      result: "Achieved seamless 1st-party integration enabling faster deployment of production-ready data pipelines",
      link: "https://www.microsoft.com/en/customers/story/1718754058912416070-astronomer-microsoft-azure-united-states",
      triggers: ["data pipeline", "data pipelines", "data engineering", "data engineer", "airflow", "orchestration", "orchestrate", "scale data", "data reliability", "etl", "data flow", "data processing", "batch processing", "data movement", "data integration", "ingest data", "data ingestion"]
    },
    {
      id: "cs2",
      company: "DeepBrain AI",
      headline: "AI Avatars Powered by Azure",
      problem: "Manually updating chatbots and language services was time-consuming and limited innovation in AI avatar capabilities.",
      solution: "Implemented Azure OpenAI Service and Azure Cognitive Services to power photo-realistic AI avatars.",
      result: "Cut development time significantly by eliminating manual processes with Azure OpenAI Service",
      link: "https://www.microsoft.com/en/customers/story/1657407824531643938-deepbrain-ai-azure-unitedstates",
      triggers: ["chatbot", "chat bot", "avatar", "ai", "artificial intelligence", "language model", "cognitive", "speech", "nlp", "natural language", "conversational", "virtual assistant", "voice", "text to speech", "speech recognition", "language understanding", "gpt", "llm", "generative ai", "gen ai"]
    },
    {
      id: "cs3",
      company: "DocuSign",
      headline: "AI Transforms Agreements",
      problem: "Outdated agreement management processes caused operational bottlenecks, costing the global economy an estimated $2 trillion annually.",
      solution: "Built the Intelligent Agreement Management (IAM) platform on Azure using Azure OpenAI Service, Cosmos DB, and SQL Database.",
      result: "Reduced contract processing time by 70% for early adopters like KPC Private Funds",
      link: "https://www.microsoft.com/en/customers/story/19814-docusign-azure-sql-database",
      triggers: ["contract", "contracts", "agreement", "agreements", "document", "documents", "processing", "legal", "compliance", "workflow", "signature", "signing", "paperwork", "approval process", "document management", "automate documents", "streamline", "bottleneck"]
    },
    {
      id: "cs4",
      company: "Accenture",
      headline: "SAP on Azure Transforms IT",
      problem: "Needed to enhance infrastructure and unify operations to support simplified digital transformation.",
      solution: "Deployed RISE with SAP on Microsoft Azure for comprehensive cloud migration including SAP S/4HANA.",
      result: "Processed outbound data 70% faster and reduced decision-making time by 15%",
      link: "https://www.microsoft.com/en/customers/story/1786976982328092426-accenture-azure-professional-services-en-united-states",
      triggers: ["sap", "erp", "enterprise resource planning", "digital transformation", "transform", "infrastructure", "migration", "migrate", "enterprise", "s4hana", "hana", "modernize", "modernization", "legacy system", "upgrade", "business process"]
    },
    {
      id: "cs5",
      company: "Zooniverse",
      headline: "Azure Boosts Citizen Science",
      problem: "Self-managed Docker environment required significant maintenance, with deployments taking up to an hour.",
      solution: "Migrated from AWS to Azure using Azure Kubernetes Service, PostgreSQL, Front Door, and Blob Storage.",
      result: "Reduced deployment time from 1 hour to 3-10 minutes and cut operational workload by one FTE",
      link: "https://www.microsoft.com/en/customers/story/1376275735613758956-zooniverse-azure-non-profit",
      triggers: ["kubernetes", "k8s", "docker", "container", "containers", "deployment", "deploy", "devops", "migration", "migrate", "aws", "amazon", "switch cloud", "move to azure", "cloud migration", "containerization", "microservices", "ci cd", "continuous"]
    },
    {
      id: "cs6",
      company: "BNY Mellon",
      headline: "Azure Scales Financial Data",
      problem: "Self-managed database environment lacked the flexibility and resiliency needed for mission-critical client data.",
      solution: "Migrated to Azure Database for PostgreSQL for fully managed, flexible database supporting microservices.",
      result: "Completed migration in just 9 months with improved scalability and resilience",
      link: "https://www.microsoft.com/en/customers/story/1762688447797085308-bnymellon-azure-banking-and-capital-markets-en-united-states",
      triggers: ["database", "databases", "postgresql", "postgres", "sql", "financial", "finance", "banking", "bank", "microservices", "scalability", "scale", "resilience", "reliable", "reliability", "mission critical", "high availability", "data storage", "managed database"]
    },
    {
      id: "cs7",
      company: "Elastic",
      headline: "Azure OpenAI Powers Search",
      problem: "Customers needed a managed, scalable, and secure cloud-based search solution for large amounts of data.",
      solution: "Built Elastic Cloud on Microsoft Azure with Azure OpenAI Service integration for vector and semantic search.",
      result: "Cloud business growing at 2x the rate of on-premises with 82% revenue improvement through system availability",
      link: "https://www.microsoft.com/en/customers/story/1653495116803202350-elastic-partner-professional-services-azure-openai-service",
      triggers: ["search", "searching", "elastic", "elasticsearch", "vector", "semantic", "data", "cloud", "find", "query", "indexing", "full text", "knowledge base", "information retrieval", "rag", "retrieval"]
    },
    {
      id: "cs8",
      company: "Saphyre",
      headline: "Azure Accelerates Financial Trading by 500%",
      problem: "Financial institutions struggled with manual pre-trade and post-trade processes involving email and fax exchanges, causing delays, security risks, and revenue losses.",
      solution: "Deployed cloud-based intelligent platform on Azure with AI models to automate trading workflows, using Defender for Cloud, Sentinel, Intune, and Purview for security.",
      result: "Reduced manual paperwork by 75% and enabled clients to trade 3-5 times faster, supporting T+1 compliance requirements",
      link: "https://www.microsoft.com/en/customers/story/1747047183590598802-saphyre-azure-banking-and-capital-markets-en-united-states",
      triggers: ["trading", "financial", "finance", "banking", "bank", "capital markets", "settlement", "compliance", "regulatory", "manual process", "paperwork", "onboarding", "client onboarding", "pre-trade", "post-trade", "security risk", "automation", "automate", "workflow"]
    },
    {
      id: "cs9",
      company: "Unum Group",
      headline: "AI Search Transforms Insurance Document Retrieval",
      problem: "Client service representatives manually searched through 300,000 digitized policies to find information, increasing error risk and reducing efficiency and customer satisfaction.",
      solution: "Built generative AI application using Azure OpenAI Service, Azure AI Search, and Azure AI Studio to process 1.3 terabytes of unstructured policy data.",
      result: "Reduced search time to 4-5 seconds with 95% accuracy, 75% of contract questions answered automatically, and 90%+ employee adoption",
      link: "https://www.microsoft.com/en/customers/story/1772120481217819586-unumgroup-azure-insurance-en-united-states",
      triggers: ["document search", "document", "documents", "search", "searching", "insurance", "policy", "policies", "customer service", "customer experience", "manual search", "knowledge retrieval", "information retrieval", "generative ai", "gen ai", "ai search", "unstructured data", "accuracy", "employee efficiency", "productivity"]
    },
    {
      id: "cs10",
      company: "Blue Yonder",
      headline: "Azure Powers Supply Chain Intelligence Platform",
      problem: "Retailers faced challenges with inflation, geopolitical stress, and sustainability regulations, needing visibility and control over complex global supply chains.",
      solution: "Built Luminate Cognitive Platform on Azure using Azure AI Services and Azure AI Studio with 15+ integrated supply chain applications.",
      result: "Transformed siloed supply chains into intelligent operating networks, enabling better supplier risk management and rapid response to market shifts",
      link: "https://www.microsoft.com/en/customers/story/1726656690348803373-blue-yonder-microsoft-azure-united-states",
      triggers: ["supply chain", "logistics", "inventory", "fulfillment", "retail", "retailer", "supplier", "vendor", "distribution", "warehouse", "demand planning", "forecasting", "geopolitical", "sustainability", "waste reduction", "asset visibility", "operations", "orchestration"]
    },
    {
      id: "cs11",
      company: "C.H. Robinson",
      headline: "Azure AI Automates Logistics Email Processing",
      problem: "Received tens of thousands of customer emails daily requiring manual processing, with routine requests waiting hours before employees could address them.",
      solution: "Built generative AI tools using Azure AI Foundry and Azure OpenAI to classify emails, extract details, and automatically execute fulfillment steps.",
      result: "Reduced email price quote time from hours to 32 seconds, issued 500,000+ AI-generated quotes, on track for 15% productivity increase",
      link: "https://www.microsoft.com/en/customers/story/19575-ch-robinson-azure-ai-studio",
      triggers: ["email", "emails", "logistics", "shipping", "freight", "transportation", "quote", "quotes", "pricing", "manual process", "automation", "automate", "customer request", "fulfillment", "supply chain", "3pl", "carrier"]
    },
    {
      id: "cs12",
      company: "Montgomery County",
      headline: "AI Chatbot Transforms Government Constituent Services",
      problem: "Original chatbot covered only 20 topics with declining usage, limiting AI-powered support for over 1 million constituents accessing public services.",
      solution: "Built Monty 2.0 using Azure OpenAI Service and Azure AI Search with retrieval augmented generation, supporting 140 languages.",
      result: "20,000 conversations facilitated, unanswered query rate dropped from 35-45% to 10-15%, coverage expanded to 3,000 topics",
      link: "https://www.microsoft.com/en/customers/story/23066-montgomery-county-azure-open-ai-service",
      triggers: ["government", "public sector", "citizen", "citizens", "constituent", "chatbot", "chat bot", "customer service", "support", "multilingual", "translation", "translate", "self-service", "call center", "contact center", "questions", "inquiries"]
    },
    {
      id: "cs13",
      company: "Carvana",
      headline: "AI Platform Provides 100% Customer Conversation Visibility",
      problem: "Needed visibility into millions of monthly customer conversations to identify issues, refine operations, and ensure consistent service quality.",
      solution: "Built CARE (Conversation Analysis Review Engine) on Azure AI Foundry using Azure Kubernetes Service, Azure AI Speech, and Cosmos DB.",
      result: "45% reduction in inbound calls per sale, 100% visibility into customer interactions versus previous sampling approach",
      link: "https://www.microsoft.com/en/customers/story/23952-carvana-azure-kubernetes-service",
      triggers: ["customer experience", "customer service", "call center", "contact center", "conversation", "conversations", "analytics", "quality", "automotive", "auto", "car", "cars", "vehicle", "speech", "voice", "support"]
    },
    {
      id: "cs14",
      company: "Document360",
      headline: "AI Knowledge Base Scales to 100K Users",
      problem: "Organizations struggle with siloed, inaccessible documentation across departments, needing customizable solutions to manage product documentation globally.",
      solution: "Built AI-powered knowledge base platform on Azure using App Service, AI Search, Azure OpenAI Service, SQL, and Logic Apps.",
      result: "50% increase in customer engagement, 40% reduction in operational costs, supports 100,000+ active monthly users",
      link: "https://www.microsoft.com/en/customers/story/20669-kovai-limited-biztalk360-azure",
      triggers: ["knowledge base", "knowledge management", "documentation", "docs", "help center", "self-service", "support", "content management", "cms", "wiki", "faq", "help articles", "customer support", "technical writing"]
    },
    {
      id: "cs15",
      company: "Paytronix",
      headline: "250 Million Customer Profiles Migrated in 2 Hours",
      problem: "Legacy SQL Server infrastructure couldn't accommodate growth demands across global markets, needed enhanced security and zero downtime migration.",
      solution: "Migrated to Microsoft Azure after six months of planning, testing 425 integrations over 30 days before production migration.",
      result: "Migration completed in under 2 hours with zero disruption, API response times improved 20%, bulk messaging 10x faster",
      link: "https://www.microsoft.com/en/customers/story/1732498019980344550-paytronix-azure-open-ai-service-retailers-en-united-states",
      triggers: ["migration", "migrate", "database migration", "sql server", "customer data", "loyalty", "loyalty program", "restaurant", "hospitality", "guest engagement", "zero downtime", "cutover", "data migration"]
    },
    {
      id: "cs16",
      company: "AT&T",
      headline: "Azure Databricks Delivers 300% ROI on Data Platform",
      problem: "On-premises data architecture created isolated silos, prevented single source of truth, and consumed resources on maintenance across 10+ petabytes daily.",
      solution: "Migrated data platform to Azure Databricks, consolidating multiple systems into unified cloud architecture for 90,000 internal users.",
      result: "Five-year ROI of 300%, reduced 80+ schemas, 3x faster data science cycles, eliminated 40% infrastructure through datacenter shutdowns",
      link: "https://www.microsoft.com/en/customers/story/20384-att-azure-databricks",
      triggers: ["databricks", "data platform", "data lake", "data warehouse", "big data", "petabyte", "petabytes", "data science", "analytics", "data silos", "siloed data", "data democratization", "self-service analytics", "telecom", "telecommunications"]
    },
    {
      id: "cs17",
      company: "Medline",
      headline: "Healthcare Supply Chain Transforms with SAP on Azure",
      problem: "On-premises SAP system created capacity constraints and IT bottlenecks as the company scaled globally, with $10M+ estimated cost for on-premises overhaul.",
      solution: "Deployed cloud-native SAP solution on Azure with Mv3-Series VMs, Oracle Database@Azure, Azure Site Recovery, and Microsoft Fabric.",
      result: "Transaction times improved 80%, response times cut 60%, IDoc processing accelerated 50%",
      link: "https://www.microsoft.com/en/customers/story/25243-medline-azure",
      triggers: ["healthcare", "health", "medical", "hospital", "supply chain", "sap", "erp", "medical supplies", "medical devices", "distribution", "transaction", "performance", "capacity", "s4hana"]
    },
    {
      id: "cs18",
      company: "State of Alaska",
      headline: "Government Migrates 700 Applications in 3 Months",
      problem: "Legacy on-premises infrastructure with isolated departmental systems hindered collaboration, with geographic constraints complicating service delivery.",
      solution: "Migrated to Azure using Azure VMware Solution for rapid legacy workload migration and Microsoft Entra for constituent identity management.",
      result: "Migrated 1,200 servers and 700 applications in three months, activated MFA for 500,000 constituents, improved transparency",
      link: "https://www.microsoft.com/en/customers/story/1747116642806599053-state-of-alaska-azure-government-en-united-states",
      triggers: ["government", "public sector", "state", "migration", "migrate", "legacy", "vmware", "datacenter", "data center", "consolidation", "identity", "authentication", "citizen services", "digital government", "modernization"]
    },
    {
      id: "cs19",
      company: "August AI",
      headline: "AI Health Companion Scales to 3.5 Million Users",
      problem: "Infrastructure limitations prevented support for rapid global expansion across 160+ countries while handling sensitive health data securely.",
      solution: "Migrated to Azure architecture using Azure AI Foundry with GPT-4o, Azure Database for PostgreSQL, and Azure Container Apps.",
      result: "Customer base grew from 500,000 to 3.5 million users, 99.99% uptime, medical exam score improved from 94.8% to 100%",
      link: "https://www.microsoft.com/en/customers/story/25636-august-ai-linux-on-azure",
      triggers: ["healthcare", "health", "medical", "patient", "health tech", "healthtech", "ai assistant", "health companion", "global", "international", "scaling", "scale", "compliance", "hipaa", "health data"]
    },
    {
      id: "cs20",
      company: "Mercy",
      headline: "Healthcare System Unlocks 5 Petabytes of Patient Data",
      problem: "Needed to modernize infrastructure and extract value from 5 petabytes of patient data while improving experiences and meeting evolving expectations.",
      solution: "Built intelligent data platform on Azure using Data Lake, Azure Machine Learning, Synapse Analytics, and AI Document Intelligence.",
      result: "Reduced average patient length of stay by removing thousands of hospital days annually, automated patient engagement",
      link: "https://www.microsoft.com/en/customers/story/1663846645014128331-mercy-health-provider-azure-en-united-states",
      triggers: ["healthcare", "health", "hospital", "patient", "patient care", "clinical", "medical", "data lake", "predictive analytics", "machine learning", "patient experience", "length of stay", "health system"]
    },
    {
      id: "cs21",
      company: "eClinicalWorks",
      headline: "AI Reduces Healthcare Paperwork Processing Time",
      problem: "Practitioners spent significant time manually reviewing thousands of faxes annually to match them with patient records, contributing to provider burnout.",
      solution: "Developed tool using Azure AI Services and Azure AI Document Intelligence to automatically scan, analyze, and match faxes to patient charts.",
      result: "427 practices implemented, 2.2 million faxes processed, up to one minute saved per fax, 75-85% accuracy rate",
      link: "https://www.microsoft.com/en/customers/story/20380-eclinicalworks-azure-ai-services",
      triggers: ["healthcare", "health", "medical", "ehr", "emr", "electronic health record", "fax", "document processing", "document intelligence", "patient records", "clinical", "practitioner", "provider", "burnout", "paperwork"]
    },
    {
      id: "cs22",
      company: "Elvia",
      headline: "Energy Utility Builds Secure DevOps Platform on Azure",
      problem: "Needed to build secure, cloud-first DevOps platform meeting Norway's data residency requirements while enabling rapid automated development.",
      solution: "Created Atlas platform using Azure Kubernetes Service, Azure AD, DDoS Protection, Web Application Firewall, and Microsoft Defender for Cloud.",
      result: "Developers can immediately start building, testing, and securing applications without requesting additional budgets, accelerating innovation",
      link: "https://www.microsoft.com/en/customers/story/1513492312077297580-elvia-energy-azure",
      triggers: ["energy", "utility", "utilities", "devops", "devsecops", "security", "secure", "platform engineering", "developer platform", "kubernetes", "k8s", "infrastructure", "automation", "ci cd", "compliance", "data residency"]
    },
    {
      id: "cs23",
      company: "ABN AMRO",
      headline: "Dutch Bank Accelerates Cloud Innovation with Kubernetes",
      problem: "Needed modern, scalable platform supporting diverse polyglot applications across hybrid environments without restricting developer innovation.",
      solution: "Implemented Azure Kubernetes Service as policy-based container platform with hybrid cloud strategy for cloud-native workloads.",
      result: "Faster application deployment and scaling, reduced operational overhead, shorter time-to-market for new services",
      link: "https://www.microsoft.com/en/customers/story/19151-abn-amro-bank-nv-azure-kubernetes-service",
      triggers: ["banking", "bank", "financial", "finance", "kubernetes", "k8s", "containers", "container", "hybrid", "hybrid cloud", "polyglot", "developer", "developers", "agility", "innovation", "fintech"]
    },
    {
      id: "cs24",
      company: "Finastra",
      headline: "Cloud Migration Enables Biweekly Software Updates",
      problem: "On-premises document management relied on quarterly updates that customers manually installed, lacking visibility into configurations.",
      solution: "Migrated LaserPro from on-premises VMs to Windows containers on Azure Kubernetes Service with Azure DevOps for centralized deployment.",
      result: "Update frequency increased from quarterly to biweekly, eliminated manual installations, reduced support costs",
      link: "https://www.microsoft.com/en/customers/story/1759082810297807726-finastra-azure-kubernetes-service-professional-services-en-united-kingdom",
      triggers: ["fintech", "financial", "finance", "banking", "bank", "kubernetes", "k8s", "containers", "devops", "deployment", "updates", "releases", "saas", "software delivery", "document management", "lending"]
    },
    {
      id: "cs25",
      company: "Dentsu",
      headline: "Media Agency Reduces Insights Time by 90%",
      problem: "Media planning teams required weeks to deliver insights to clients, creating delays in campaign execution and risking missed opportunities.",
      solution: "Built conversational AI copilot using Azure AI Foundry, Azure OpenAI Service, and Azure Machine Learning for natural language media queries.",
      result: "Analysis time reduced 80%, overall time to insight reduced 90%, insights delivered in minutes instead of weeks",
      link: "https://www.microsoft.com/en/customers/story/19582-dentsu-azure-kubernetes-service",
      triggers: ["media", "advertising", "marketing", "agency", "analytics", "insights", "reporting", "campaign", "copilot", "natural language", "business intelligence", "bi", "data analysis", "forecasting", "budget"]
    },
    {
      id: "cs26",
      company: "JATO Dynamics",
      headline: "Azure AI Transforms Automotive Dealership Sales",
      problem: "Car dealerships needed to benchmark performance against competitors while generating compelling marketing content to boost sales efficiency.",
      solution: "Developed Sales Link using Azure OpenAI Service, Cosmos DB, SQL Database, Data Factory, and Azure AI Search for AI-driven content generation.",
      result: "Dealerships save 32 hours monthly through automated content generation, platform operates across five countries with multilingual support",
      link: "https://www.microsoft.com/en/customers/story/19641-jato-dynamics-azure",
      triggers: ["automotive", "auto", "car", "cars", "dealership", "dealer", "dealers", "sales", "marketing", "content generation", "benchmarking", "competitive", "vehicle", "vehicles", "multilingual"]
    },
    {
      id: "cs27",
      company: "FedEx",
      headline: "Azure Synapse Powers Financial Services Analytics",
      problem: "Revenue Services division struggled with massive data volumes as company grew rapidly, legacy systems couldn't handle large datasets efficiently.",
      solution: "Deployed Azure Synapse Analytics as central data warehousing platform with pipelines, Spark notebooks, and Azure Machine Learning.",
      result: "Significantly faster data processing, developed predictive models for payment segmentation, credit risk scoring, and freight anomaly detection",
      link: "https://www.microsoft.com/en/customers/story/1686419413331162973-fedex-azure-synapse-analytics-united-states",
      triggers: ["shipping", "logistics", "freight", "analytics", "data warehouse", "synapse", "financial", "finance", "revenue", "predictive", "machine learning", "credit risk", "anomaly detection", "big data"]
    },
    {
      id: "cs28",
      company: "Square Enix",
      headline: "Gaming Developer Builds AI Chatbot in 3 Days",
      problem: "Game engine department received countless daily questions from developers, creating overwhelming workloads while barriers prevented some from asking.",
      solution: "Implemented Hisui-chan AI chatbot using Azure OpenAI Service GPT-4, Azure AI Search, Azure Functions, and Azure Blob Storage with Slack integration.",
      result: "Built chatbot in 3 days, supports 100+ users, developers gain faster access to information, non-programmers can create game data via auto-generated code",
      link: "https://www.microsoft.com/en/customers/story/21034-square-enix-co-ltd-azure-ai-search",
      triggers: ["gaming", "game", "games", "developer", "developers", "chatbot", "chat bot", "internal support", "knowledge sharing", "code generation", "slack", "productivity", "developer experience", "devex"]
    },
    {
      id: "cs29",
      company: "Clockworks Analytics",
      headline: "Building Analytics Platform Drives $69M Energy Savings",
      problem: "Processes millions of equipment data points across 600 million square feet while growing 40% annually, requiring greater database scalability.",
      solution: "Implemented Azure SQL Database Hyperscale, Virtual Machines, Virtual Machine Scale Sets, and Microsoft Defender for Cloud.",
      result: "$69 million cumulative energy savings for customers, 800,000 tons carbon emissions avoided, 92% reduction in scaling time",
      link: "https://www.microsoft.com/en/customers/story/25365-clockworks-analytics-microsoft-defender-for-cloud",
      triggers: ["energy", "sustainability", "carbon", "emissions", "building", "buildings", "facilities", "iot", "analytics", "hvac", "equipment", "maintenance", "efficiency", "green", "environmental", "smart building"]
    },
    {
      id: "cs30",
      company: "BMW Group",
      headline: "Azure Delivers 10x Faster Vehicle Data Analysis",
      problem: "Engineers manually transferred data from 3,500 development cars using hard drives to on-premises servers, with at least one day delay before analysis.",
      solution: "Created Mobile Data Recorder system using Azure App Service, Azure AI, Kubernetes Service, Data Explorer, and IoT Hub with GPT-4o-powered copilot.",
      result: "10x faster data delivery and analysis, 3,500 cars transmitting real-time data, democratized data access across engineering teams",
      link: "https://www.microsoft.com/en/customers/story/19769-bmw-ag-azure-app-service",
      triggers: ["automotive", "auto", "car", "cars", "vehicle", "vehicles", "iot", "internet of things", "telemetry", "real-time", "realtime", "data analysis", "manufacturing", "engineering", "copilot", "natural language"]
    },
    {
      id: "cs31",
      company: "Accenture AI",
      headline: "Azure AI Foundry Reduces AI Build Time by 50%",
      problem: "Clients struggled moving beyond AI proofs of concept to production-grade applications meeting regulatory and compliance standards at enterprise scale.",
      solution: "Built centralized platform using Azure AI Foundry integrating AI Search, AI Content Safety, Functions, App Service, and Machine Learning.",
      result: "50% reduction in AI app build time, 30% efficiency increase, 75+ use cases deployed, 16+ solutions in production",
      link: "https://www.microsoft.com/en/customers/story/23953-accenture-azure-ai-foundry",
      triggers: ["ai foundry", "ai platform", "ai infrastructure", "mlops", "ml ops", "model deployment", "ai governance", "responsible ai", "ai development", "generative ai", "gen ai", "production ai", "enterprise ai", "ai scale", "ai at scale", "proof of concept", "poc"]
    },
    {
      id: "cs32",
      company: "AUDI AG",
      headline: "Deployed AI Assistant in 2 Weeks with Azure AI Foundry",
      problem: "Employees needed faster information access but manual support processes created operational overhead, requiring 24/7 self-service solution.",
      solution: "Built enterprise AI framework using Azure AI Foundry, App Service, Cosmos DB with RAG using Azure OpenAI and AI Search.",
      result: "Deployed first AI assistant in 2 weeks, expanded to 8 additional agents, reduced HR operational burden with enterprise security",
      link: "https://www.microsoft.com/en/customers/story/24786-audi-ag-azure-ai-foundry",
      triggers: ["ai assistant", "chatbot", "chat bot", "enterprise ai", "ai deployment", "rapid deployment", "ai foundry", "rag", "retrieval augmented generation", "hr", "human resources", "employee support", "self-service", "internal ai"]
    },
    {
      id: "cs33",
      company: "Bentley Systems",
      headline: "Azure ML Accelerates Model Delivery 3-5x",
      problem: "Development workflows lacked structure with manual handoffs between data scientists and MLOps engineers, creating bottlenecks and visibility gaps.",
      solution: "Created MLOps framework using Azure Machine Learning with PyTorch enabling local development while auto-logging experiments to Azure.",
      result: "3-5x faster model delivery, training time reduced from 5 days to 1 day, 8 production models deployed successfully",
      link: "https://www.microsoft.com/en/customers/story/1480221307332639219-bentley-systems-partner-professional-services-azure-machine-learning",
      triggers: ["mlops", "ml ops", "machine learning", "model training", "model deployment", "data science", "gpu", "pytorch", "model development", "ai infrastructure", "ml infrastructure", "training pipeline", "model lifecycle", "experiment tracking"]
    },
    {
      id: "cs34",
      company: "OpenAI",
      headline: "Azure Blob Storage Enables Exabyte-Scale AI Training",
      problem: "Training massive AI models created critical storage challenges with enormous datasets and frequent checkpointing across thousands of GPUs simultaneously.",
      solution: "Deployed Azure Blob Storage scaled accounts with HPC virtual machines, Virtual WAN, and Put Blob From URL API for cross-region replication.",
      result: "Achieved 10 terabits/second throughput (20x improvement), exabyte-scale operations without operational complexity",
      link: "https://www.microsoft.com/en/customers/story/23427-openai-lp-azure-blob-storage",
      triggers: ["storage", "blob storage", "model training", "gpu", "gpus", "checkpoint", "checkpointing", "exabyte", "petabyte", "large scale", "high performance", "hpc", "throughput", "ai training", "model training", "supercomputing"]
    },
    {
      id: "cs35",
      company: "Hexagon",
      headline: "Azure AI Reduces Industrial Document Processing from Days to Hours",
      problem: "Industrial customers struggled extracting actionable insights from complex engineering data and images with time-consuming manual document processing.",
      solution: "Rebuilt SDx platform as cloud-native SaaS using Azure AI Foundry, Azure OpenAI, AI Document Intelligence, Machine Learning, and AKS.",
      result: "Document tagging reduced from 2-3 days to under 1 hour, $1.6M productivity gains, 90% faster facility onboarding",
      link: "https://www.microsoft.com/en/customers/story/24303-hexagon-azure",
      triggers: ["document processing", "document intelligence", "engineering", "industrial", "manufacturing", "cloud native", "saas", "platform", "kubernetes", "aks", "document extraction", "data extraction", "ai foundry", "productivity"]
    }
  ],

  // ============================================
  // DISCOVERY QUESTIONS
  // High-impact questions to ask during sales calls
  // ============================================
  discoveryQuestions: [
    // Category 1: Azure-Specific Workload Questions (dq1-dq35)
    {
      id: "dq1",
      question: "Are your engineers spending more time maintaining orchestration infrastructure than actually building pipeline logic? It's a pattern we see and it eats velocity.",
      context: "Uncovers hidden costs of self-managed data orchestration and opens door to managed Airflow/Data Factory discussion",
      triggers: ["data pipeline", "data pipelines", "airflow", "orchestration", "etl", "data factory", "synapse pipelines", "data flow", "batch processing", "data movement", "data integration", "data ingestion", "databricks", "spark"]
    },
    {
      id: "dq2",
      question: "Are you still at proof-of-concept with generative AI, or have you hit the wall where your base model accuracy isn't production-ready?",
      context: "Identifies where they are in the AI maturity curve and opens fine-tuning/RAG conversation",
      triggers: ["azure openai", "gpt", "llm", "generative ai", "gen ai", "ai foundry", "fine-tuning", "fine tuning", "rag", "retrieval augmented", "prompt engineering", "embeddings", "copilot", "chatgpt", "gpt-4", "gpt-4o"]
    },
    {
      id: "dq3",
      question: "What's your strategy when a single database can't handle both your transactional and analytical workloads anymore?",
      context: "Opens conversation about purpose-built databases and modern data architecture",
      triggers: ["cosmosdb", "cosmos db", "postgresql", "postgres", "sql database", "sql server", "mongodb", "mysql", "sql managed instance", "database", "databases", "nosql", "relational", "transactional"]
    },
    {
      id: "dq4",
      question: "What would it mean for your business if your SAP landscape could scale on-demand instead of being constrained by on-prem capacity?",
      context: "Identifies SAP pain points and opens RISE with SAP on Azure discussion",
      triggers: ["sap", "s4hana", "s/4hana", "hana", "erp", "rise with sap", "sap migration", "sap modernization", "bw/4hana", "sap btp", "sap workload", "fiori", "abap"]
    },
    {
      id: "dq5",
      question: "How much time does your team spend on Kubernetes cluster maintenance versus actually shipping features?",
      context: "Uncovers operational overhead of self-managed K8s and positions AKS value",
      triggers: ["kubernetes", "k8s", "aks", "docker", "containers", "container", "microservices", "container apps", "helm", "kubectl", "pod", "pods", "cluster", "containerization", "service mesh"]
    },
    {
      id: "dq6",
      question: "When you moved your first workloads to the cloud, what surprised you most about what was harder than expected?",
      context: "Surfaces migration lessons and hidden blockers for remaining workloads",
      triggers: ["azure migrate", "cloud migration", "lift and shift", "vmware", "avs", "azure vmware", "landing zone", "datacenter", "data center", "replatform", "rehost", "migration factory", "wave planning"]
    },
    {
      id: "dq7",
      question: "How are your users finding information today—are they searching across multiple systems or is there a single source of truth?",
      context: "Opens AI Search and RAG-based knowledge retrieval discussion",
      triggers: ["azure ai search", "cognitive search", "vector search", "semantic search", "rag", "knowledge retrieval", "search index", "elasticsearch", "full text search", "information retrieval", "document search", "enterprise search"]
    },
    {
      id: "dq8",
      question: "When your security team gets an alert at 2 AM, how long does it take them to understand the blast radius and respond?",
      context: "Identifies gaps in security operations and positions Sentinel/Defender",
      triggers: ["defender for cloud", "sentinel", "microsoft sentinel", "siem", "soar", "security operations", "soc", "threat detection", "xdr", "entra id", "zero trust", "conditional access", "purview", "dlp"]
    },
    {
      id: "dq9",
      question: "What happens to your supply chain visibility when a key supplier goes dark or a port gets congested?",
      context: "Opens conversation about IoT, digital twins, and AI-driven forecasting for supply chain",
      triggers: ["supply chain", "iot", "iot hub", "digital twins", "azure digital twins", "forecasting", "demand planning", "inventory", "logistics", "warehouse", "asset tracking", "telemetry", "sensors", "edge"]
    },
    {
      id: "dq10",
      question: "Are your analysts still waiting days for data refreshes, or can they self-serve real-time insights?",
      context: "Identifies analytics bottlenecks and positions Synapse/Fabric/Databricks",
      triggers: ["synapse analytics", "synapse", "databricks", "power bi", "microsoft fabric", "data lakehouse", "data warehouse", "data lake", "analytics", "business intelligence", "bi", "reporting", "dashboards", "olap"]
    },
    {
      id: "dq11",
      question: "What's the latency like between your on-prem environment and the cloud today? Is that affecting user experience?",
      context: "Opens networking conversation about ExpressRoute, Private Link, and hybrid connectivity",
      triggers: ["expressroute", "express route", "front door", "private link", "virtual wan", "vwan", "vpn", "latency", "bandwidth", "peering", "network", "networking", "connectivity", "cdn", "traffic manager"]
    },
    {
      id: "dq12",
      question: "How long does it take to spin up a new environment for a dev team today? Hours, days, or weeks?",
      context: "Identifies IaC and DevOps maturity and positions Azure DevOps/GitHub Actions",
      triggers: ["azure devops", "github actions", "terraform", "bicep", "arm templates", "infrastructure as code", "iac", "ci cd", "pipeline", "gitops", "devops", "automation", "deployment", "environment provisioning"]
    },
    {
      id: "dq13",
      question: "Do you have visibility into which teams are driving your cloud spend, or is it a black box until the bill arrives?",
      context: "Opens FinOps and cost optimization conversation",
      triggers: ["finops", "reserved instances", "savings plan", "cost management", "azure cost", "tco", "total cost of ownership", "rightsizing", "spending", "budget", "chargeback", "showback", "cost optimization"]
    },
    {
      id: "dq14",
      question: "What's keeping you from running a consistent operating model across your on-prem and cloud environments?",
      context: "Positions Azure Arc and hybrid management capabilities",
      triggers: ["azure arc", "hybrid cloud", "multi-cloud", "azure stack", "azure stack hci", "hybrid", "on-premises", "edge", "distributed", "consistent management", "unified operations"]
    },
    {
      id: "dq15",
      question: "Are your legacy apps holding back your cloud strategy, or have you found a way to modernize them incrementally?",
      context: "Opens app modernization conversation—App Service, Functions, API Management",
      triggers: ["app service", "azure functions", "logic apps", "api management", "app modernization", "serverless", "paas", "web apps", "legacy apps", "monolith", "refactor", "modernization"]
    },
    {
      id: "dq16",
      question: "How confident are you that only the right people have access to the right resources—and that it stays that way?",
      context: "Opens identity governance and Entra ID conversation",
      triggers: ["entra id", "azure ad", "identity", "conditional access", "privileged identity", "pim", "access reviews", "sso", "single sign-on", "mfa", "identity governance", "rbac", "entitlement"]
    },
    {
      id: "dq17",
      question: "When your model training jobs need 1,000 GPUs, how quickly can you get them—and what does it cost you to wait?",
      context: "Positions large-scale AI infrastructure and GPU availability",
      triggers: ["gpu", "gpus", "model training", "ai training", "hpc", "high performance compute", "a100", "h100", "nd series", "nv series", "inference", "fine tuning", "checkpointing", "distributed training"]
    },
    {
      id: "dq18",
      question: "Have you looked at the Marketplace as a channel to reach Microsoft's enterprise customers?",
      context: "Opens ISV GTM partnership and Marketplace transactability discussion",
      triggers: ["marketplace", "azure marketplace", "isv", "partner", "transact", "co-sell", "gtm", "go to market", "macc", "software provider", "saas offer", "managed app", "commercial marketplace"]
    },
    {
      id: "dq19",
      question: "What's your plan when the volume of documents coming in exceeds what humans can reasonably process?",
      context: "Opens Document Intelligence and AI-powered document processing conversation",
      triggers: ["document intelligence", "form recognizer", "document processing", "ocr", "document extraction", "invoice processing", "pdf", "unstructured data", "document automation", "intelligent document"]
    },
    {
      id: "dq20",
      question: "How are you handling the gap between what your data scientists build locally and what actually runs in production?",
      context: "Identifies MLOps maturity and positions Azure Machine Learning",
      triggers: ["mlops", "ml ops", "azure machine learning", "aml", "model deployment", "model lifecycle", "experiment tracking", "model registry", "feature store", "ml pipeline", "production ml", "data science"]
    },
    {
      id: "dq21",
      question: "When a clinician needs information from a patient record, how many clicks and systems does that take today?",
      context: "Opens healthcare-specific AI and data platform discussion",
      triggers: ["ehr", "emr", "electronic health record", "patient record", "clinical", "fhir", "health data", "healthcare", "health", "hospital", "patient care", "provider", "practitioner"]
    },
    {
      id: "dq22",
      question: "What's your strategy for keeping developers productive without sacrificing security guardrails?",
      context: "Opens developer experience and platform engineering conversation",
      triggers: ["developer experience", "devex", "platform engineering", "developer productivity", "inner loop", "dev box", "devsecops", "developer platform", "self-service", "golden path", "paved road"]
    },
    {
      id: "dq23",
      question: "How do you balance giving business users the analytics access they need while protecting sensitive data?",
      context: "Opens data governance and Purview conversation",
      triggers: ["purview", "data governance", "data catalog", "data lineage", "sensitive data", "data classification", "data estate", "metadata", "data discovery", "compliance", "data privacy"]
    },
    {
      id: "dq24",
      question: "Are your real-time workloads hitting the scale limits of your current event infrastructure?",
      context: "Opens Event Hubs and streaming architecture conversation",
      triggers: ["event hubs", "kafka", "streaming", "real-time", "realtime", "event-driven", "event driven", "pub sub", "message queue", "service bus", "ingestion", "stream processing", "event grid"]
    },
    {
      id: "dq25",
      question: "What would it mean if your internal teams could build AI assistants as fast as they can write a document?",
      context: "Opens AI Foundry and low-code AI development conversation",
      triggers: ["ai foundry", "ai studio", "ai builder", "power platform", "copilot studio", "low code", "citizen developer", "ai assistant", "ai agent", "enterprise ai", "rapid ai", "internal ai"]
    },
    {
      id: "dq26",
      question: "How are you thinking about responsible AI—governance, content safety, and fairness—as you scale your AI deployments?",
      context: "Opens responsible AI and AI governance conversation",
      triggers: ["responsible ai", "ai governance", "content safety", "ai content", "fairness", "bias", "transparency", "ai ethics", "red team", "jailbreak", "prompt injection", "ai security"]
    },
    {
      id: "dq27",
      question: "When your vehicle telemetry data needs to be analyzed in minutes instead of days, what breaks in your current architecture?",
      context: "Opens IoT and real-time analytics for automotive/manufacturing",
      triggers: ["telemetry", "vehicle data", "automotive", "manufacturing", "factory", "iot hub", "data explorer", "kusto", "adx", "time series", "sensor data", "connected car", "telematics"]
    },
    {
      id: "dq28",
      question: "Are your API integrations becoming a maintenance burden, or do you have a strategy to manage them centrally?",
      context: "Opens API Management and integration architecture conversation",
      triggers: ["api management", "apim", "api gateway", "api", "apis", "integration", "microservices", "backend", "api security", "rate limiting", "developer portal", "api versioning"]
    },
    {
      id: "dq29",
      question: "How long does it take your team to go from an AI prototype to something that's production-ready and compliant?",
      context: "Identifies gap between POC and production AI, opens AI Foundry discussion",
      triggers: ["proof of concept", "poc", "prototype", "pilot", "production ready", "production ai", "scale ai", "enterprise ai", "ai at scale", "ai compliance", "ai production", "mvp"]
    },
    {
      id: "dq30",
      question: "What happens to your business continuity when a region goes down—do you have confidence in your DR strategy?",
      context: "Opens BCDR and multi-region architecture conversation",
      triggers: ["disaster recovery", "dr", "bcdr", "business continuity", "failover", "region", "availability zone", "geo-redundant", "backup", "site recovery", "rpo", "rto", "resilience"]
    },
    {
      id: "dq31",
      question: "Are your data pipelines giving you a unified view of the customer, or are you still stitching together siloed sources?",
      context: "Opens data integration and customer 360 conversation",
      triggers: ["customer 360", "data silos", "siloed data", "data integration", "unified data", "master data", "mdm", "single source of truth", "customer data platform", "cdp", "data fabric"]
    },
    {
      id: "dq32",
      question: "How do you handle the storage demands when your AI training checkpoints are measured in terabytes?",
      context: "Opens Blob Storage and large-scale AI infrastructure conversation",
      triggers: ["blob storage", "storage", "storage account", "checkpoint", "checkpointing", "ai storage", "data lake storage", "adls", "large files", "exabyte", "petabyte", "object storage"]
    },
    {
      id: "dq33",
      question: "What's your strategy for managing costs when your workloads are unpredictable—do you end up overprovisioning?",
      context: "Opens autoscaling, consumption pricing, and serverless conversation",
      triggers: ["autoscaling", "auto-scaling", "burst", "burstable", "consumption", "pay as you go", "payg", "scale up", "scale out", "variable workload", "unpredictable", "serverless", "elastic"]
    },
    {
      id: "dq34",
      question: "How are you handling multi-language content across regions without blowing up your localization budget?",
      context: "Opens Azure AI Translator and multilingual AI conversation",
      triggers: ["translation", "translator", "multilingual", "localization", "language", "languages", "speech translation", "global", "international", "multi-language", "translate", "cognitive services"]
    },
    {
      id: "dq35",
      question: "What's blocking you from getting value out of all that unstructured content sitting in SharePoint and file shares?",
      context: "Opens AI Search, knowledge mining, and content AI conversation",
      triggers: ["sharepoint", "file share", "unstructured content", "knowledge mining", "content understanding", "cognitive skills", "skillset", "document understanding", "enterprise content", "content ai"]
    },

    // Category 2: Strategic Cloud Discovery Questions (dq36-dq50)
    {
      id: "dq36",
      question: "What's driving the urgency to move now versus six months from now?",
      context: "Understand timeline drivers and create urgency",
      triggers: ["azure", "cloud strategy", "cloud-first", "cloud first", "digital transformation", "modernization", "cloud initiative", "cloud program", "cloud adoption", "azure migration"]
    },
    {
      id: "dq37",
      question: "How are you measuring success—is it cost, speed to market, or something else entirely?",
      context: "Understand their success metrics to align value messaging",
      triggers: ["tco", "total cost of ownership", "roi", "return on investment", "kpi", "metrics", "success criteria", "business case", "value realization", "business value"]
    },
    {
      id: "dq38",
      question: "What would need to be true for you to consolidate on a single cloud platform?",
      context: "Understand multi-cloud strategy and consolidation opportunities",
      triggers: ["multi-cloud", "multicloud", "aws", "gcp", "google cloud", "cloud provider", "vendor", "consolidation", "primary cloud", "strategic cloud", "cloud decision"]
    },
    {
      id: "dq39",
      question: "How does your cloud investment decision fit into your broader EA or MACC commitments?",
      context: "Understand existing Microsoft relationship and commercial leverage",
      triggers: ["ea agreement", "enterprise agreement", "macc", "azure commitment", "microsoft commitment", "consumption", "commitment", "contract", "renewal", "licensing"]
    },
    {
      id: "dq40",
      question: "What's your experience been with cloud provider support when something critical breaks at 3 AM?",
      context: "Surfaces support and SLA concerns, positions Microsoft support offerings",
      triggers: ["support", "sla", "service level", "uptime", "availability", "premier support", "unified support", "critical", "outage", "incident", "response time"]
    },
    {
      id: "dq41",
      question: "How are you balancing the need to innovate quickly against the reality of maintaining existing systems?",
      context: "Understand resource constraints and modernization strategy",
      triggers: ["iaas", "paas", "saas", "cloud native", "cloud-native", "legacy", "technical debt", "innovation", "maintenance", "bimodal", "two-speed", "modernize"]
    },
    {
      id: "dq42",
      question: "What's held you back from using reserved instances or savings plans more aggressively?",
      context: "Opens FinOps and commitment discount conversation",
      triggers: ["reserved instances", "savings plan", "reservation", "committed use", "discount", "pricing", "consumption model", "payg", "pay as you go", "finops", "optimization"]
    },
    {
      id: "dq43",
      question: "How aligned is your security team with your cloud team on shared responsibility?",
      context: "Understand org structure and security alignment",
      triggers: ["shared responsibility", "cloud security", "security team", "ciso", "security posture", "compliance", "zero trust", "governance", "risk management", "audit"]
    },
    {
      id: "dq44",
      question: "Are your Well-Architected assessments revealing the same issues repeatedly, or are you seeing progress?",
      context: "Opens Well-Architected Framework and architectural review conversation",
      triggers: ["well-architected", "well architected", "waf", "architecture review", "best practices", "reliability", "performance", "cost optimization", "operational excellence", "security pillar"]
    },
    {
      id: "dq45",
      question: "What happens when a new project team needs infrastructure—do they wait in a queue or can they self-serve?",
      context: "Understand landing zone and governance maturity",
      triggers: ["landing zone", "cloud foundation", "caf", "cloud adoption framework", "governance", "guardrails", "policy", "azure policy", "management group", "subscription", "self-service"]
    },
    {
      id: "dq46",
      question: "How do you handle data residency and sovereignty requirements across your different markets?",
      context: "Opens compliance and sovereign cloud conversation",
      triggers: ["data residency", "sovereignty", "sovereign cloud", "gdpr", "regulatory", "compliance", "region", "geo", "local requirements", "data sovereignty", "cross-border"]
    },
    {
      id: "dq47",
      question: "What's your team's experience level with cloud—are they ramping up or already deep in production workloads?",
      context: "Understand skills gap and training needs",
      triggers: ["training", "certification", "skills", "learning", "enablement", "cloud skills", "talent", "hiring", "team", "experience", "expertise", "ramp up"]
    },
    {
      id: "dq48",
      question: "How does your procurement process handle cloud consumption versus traditional capex purchases?",
      context: "Understand procurement dynamics and potential blockers",
      triggers: ["procurement", "capex", "opex", "consumption", "budget", "purchasing", "approval", "vendor management", "contract", "commercial", "pricing model"]
    },
    {
      id: "dq49",
      question: "What would it take to get your on-prem VMware workloads running in Azure without refactoring everything?",
      context: "Opens Azure VMware Solution conversation for VMware customers",
      triggers: ["vmware", "avs", "azure vmware solution", "vsphere", "vsan", "nsx", "vcenter", "vmware cloud", "hcx", "vmware migration", "vmware workloads"]
    },
    {
      id: "dq50",
      question: "Where does Microsoft's relationship with OpenAI factor into your AI platform decisions?",
      context: "Leverage the exclusive OpenAI partnership as a differentiator",
      triggers: ["openai", "gpt", "chatgpt", "gpt-4", "gpt-4o", "o1", "dall-e", "whisper", "ai platform", "ai strategy", "llm", "large language model", "foundation model"]
    }
  ],

  // ============================================
  // PROOF POINTS
  // Statistics, research findings, and analyst insights
  // ============================================
  proofPoints: [
    {
      id: "pp1",
      stat: "Microsoft has been named a Leader in Gartner's Magic Quadrant for Cloud AI Developer Services for the fifth consecutive year, placed furthest for Completeness of Vision.",
      source: "Gartner Magic Quadrant for Cloud AI Developer Services (2024)",
      link: "https://www.gartner.com/doc/reprints?id=1-2L17FZK4&ct=250519&st=sb",
      triggers: ["ai", "artificial intelligence", "machine learning", "ml", "gartner", "analyst", "leader", "leadership", "comparison", "compare", "versus", "vs", "how does azure", "why azure", "why microsoft", "best", "top"]
    },
    {
      id: "pp2",
      stat: "More than 80,000 enterprises across healthcare, manufacturing, and retail are leveraging Azure AI Foundry to deliver transformative solutions.",
      source: "Gartner Magic Quadrant for AI Application Development Platforms (2025)",
      link: "https://www.gartner.com/doc/reprints?id=1-2LM5HTZJ&ct=250805&st=sb",
      triggers: ["enterprise", "enterprises", "healthcare", "health", "hospital", "manufacturing", "factory", "retail", "store", "industry", "industries", "customers", "who uses", "who else", "other companies", "adoption", "using azure"]
    },
    {
      id: "pp3",
      stat: "Accenture reduced AI app build time by 50% and deployed 17 use cases in just four months using Azure AI Foundry.",
      source: "Forrester Total Economic Impact Study",
      link: "https://go.microsoft.com/fwlink/?linkid=2343521&clcid=0x409",
      triggers: ["development time", "build", "building", "deploy", "deployment", "fast", "faster", "quick", "quickly", "accelerate", "speed", "time", "how long", "timeline", "reduce time", "save time", "efficiency", "productive"]
    },
    {
      id: "pp4",
      stat: "Combining fine-tuning with RAG boosts accuracy, reduces hallucinations, lowers costs, and improves compliance—with reduced token usage and faster response times.",
      source: "Microsoft Guide: Unlocking Business Value with Fine-Tuning",
      link: "https://info.microsoft.com/ww-landing-unlocking-business-value-with-fine-tuning.html",
      triggers: ["fine-tuning", "fine tuning", "finetune", "rag", "retrieval", "accuracy", "accurate", "hallucination", "hallucinate", "making things up", "wrong answers", "cost", "costs", "token", "tokens", "expensive", "cheaper"]
    },
    {
      id: "pp5",
      stat: "Early adopters have reported 50% faster development cycles for AI solutions using Foundry's managed components. Over 70,000 customers process 100 trillion tokens per quarter.",
      source: "MIT Technology Review Insights: AI Model Customization",
      link: "https://go.microsoft.com/fwlink/?linkid=2345986&clcid=0x409",
      triggers: ["development", "cycle", "cycles", "token", "tokens", "scale", "scaling", "volume", "adoption", "early adopters", "how many", "customers", "production", "processing", "throughput"]
    },
    {
      id: "pp6",
      stat: "Azure AI platform offers access to 11,000+ AI models with tools like Model Router, Model Leaderboard, and Model Benchmarks for optimal model selection.",
      source: "MIT Technology Review Insights",
      link: "https://go.microsoft.com/fwlink/?linkid=2345986&clcid=0x409",
      triggers: ["model", "models", "choice", "choices", "selection", "select", "options", "variety", "flexibility", "flexible", "which model", "different models", "openai", "llama", "mistral", "open source", "multiple"]
    }
  ]
};

module.exports = { getKnowledgeBase, hasUserKnowledgeBase, defaultKnowledgeBase };
