import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import TabNavigation from "@/components/rma/TabNavigation";
import RmaForm from "@/components/rma/RmaForm";

const Index = () => {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="py-8 md:py-12 border-b border-border bg-card">
          <div className="container mx-auto px-4">
            <div className="mb-4">
              <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
                <span className="text-foreground">C </span>
                <span className="text-primary">R </span>
                <span className="text-foreground">E S T</span>
              </h1>
            </div>
            <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-6">
              CREST 產品申請報修系統
            </h2>
            <TabNavigation />
          </div>
        </section>

        {/* Form Section */}
        <section className="py-8 md:py-12">
          <div className="container mx-auto px-4">
            <div className="text-center mb-8">
              <h3 className="text-2xl font-bold text-foreground mb-2">
                產品維修登記
              </h3>
              <p className="text-muted-foreground">
                請填寫以下資料送出您的RMA申請
              </p>
            </div>

            <div className="max-w-3xl mx-auto">
              <RmaForm />
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default Index;
