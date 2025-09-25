import { useState } from "react";
import { useLocation } from "wouter";
import { Star } from "lucide-react";
import StepForm from "@/components/register/step-form";
import { Card, CardContent } from "@/components/ui/card";

export default function Register() {
  const [, setLocation] = useLocation();
  const [currentStep, setCurrentStep] = useState(1);

  const handleRegistrationComplete = () => {
    // Redirect new users directly to dashboard after registration (subscription managed in dashboard)
    setLocation("/");
  };

  return (
    <main className="min-h-[calc(100vh-80px)] flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <Card className="bg-card rounded-xl shadow-xl border border-border">
          <CardContent className="p-8">
            {/* Header */}
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-primary rounded-xl mx-auto mb-4 flex items-center justify-center">
                <Star className="w-8 h-8 text-primary-foreground" />
              </div>
              <h2 className="text-2xl font-bold text-foreground mb-2">
                Cadastro de Nutricionista
              </h2>
              <p className="text-muted-foreground">
                Configure seu agente de atendimento IA via WhatsApp
              </p>
            </div>

            {/* Progress Indicator */}
            <div className="mb-8">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm text-foreground">
                  Passo <span data-testid="current-step">{currentStep}</span> de 3
                </span>
                <span className="text-sm text-primary">
                  {currentStep === 1 && "Dados Pessoais"}
                  {currentStep === 2 && "Contato"}
                  {currentStep === 3 && "WhatsApp Profissional"}
                </span>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div
                  className="bg-primary h-2 rounded-full transition-all duration-300"
                  style={{ width: `${(currentStep / 3) * 100}%` }}
                  data-testid="progress-bar"
                />
              </div>
            </div>

            <StepForm
              currentStep={currentStep}
              onStepChange={setCurrentStep}
              onComplete={handleRegistrationComplete}
            />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
