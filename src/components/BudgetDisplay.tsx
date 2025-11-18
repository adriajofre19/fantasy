import React from 'react';

interface BudgetDisplayProps {
    budget: number;
}

const BudgetDisplay: React.FC<BudgetDisplayProps> = ({ budget }) => {
    return (
        <div className="bg-muted/50 rounded-lg px-4 py-2 inline-block">
            <p className="text-sm text-muted-foreground">Tu Presupuesto</p>
            <p className="text-2xl font-bold text-foreground">${budget.toLocaleString()}</p>
        </div>
    );
};

export default BudgetDisplay;

