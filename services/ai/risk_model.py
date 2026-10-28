import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from typing import Dict, Any, List

class SLABreachRiskModel:
    DISCLAIMER = "Synthetic training data, demo only"

    def __init__(self):
        self.pipeline: Pipeline = None
        self._train_synthetic_model()

    def _train_synthetic_model(self):
        """
        Trains a deterministic logistic regression model on synthetic FDR compliance data.
        Features:
        0: days_remaining (fewer days -> higher breach risk)
        1: revert_count (more reverts -> higher breach risk)
        2: discrepancy_count (more discrepancies -> higher breach risk)
        3: days_in_scrutiny (longer scrutiny -> higher breach risk)
        4: amount_lakhs (higher amount -> slight complexity increase)
        """
        rng = np.random.RandomState(42)
        n_samples = 2500

        days_remaining = rng.uniform(-10, 90, n_samples)
        revert_count = rng.poisson(0.8, n_samples)
        discrepancy_count = rng.poisson(0.6, n_samples)
        days_in_scrutiny = rng.uniform(1, 45, n_samples)
        amount_lakhs = rng.uniform(10, 100, n_samples)

        # Ground truth synthetic risk score
        # Logit: heavily penalized by negative days remaining, high reverts, and lingering scrutiny
        logit = (
            -0.08 * days_remaining
            + 0.95 * revert_count
            + 1.10 * discrepancy_count
            + 0.07 * days_in_scrutiny
            + 0.005 * amount_lakhs
            - 1.5
        )
        prob = 1.0 / (1.0 + np.exp(-logit))
        y = (prob > 0.5).astype(int)

        X = np.column_stack([
            days_remaining,
            revert_count,
            discrepancy_count,
            days_in_scrutiny,
            amount_lakhs,
        ])

        self.pipeline = Pipeline([
            ("scaler", StandardScaler()),
            ("clf", LogisticRegression(random_state=42, C=1.0)),
        ])
        self.pipeline.fit(X, y)

    def predict(
        self,
        days_remaining: float = 30.0,
        revert_count: int = 0,
        discrepancy_count: int = 0,
        days_in_scrutiny: float = 5.0,
        amount: float = 1500000.0,
    ) -> Dict[str, Any]:
        """
        Predicts breach risk probability with interpretability breakdown.
        """
        amount_lakhs = amount / 100000.0
        features = np.array([[
            days_remaining,
            revert_count,
            discrepancy_count,
            days_in_scrutiny,
            amount_lakhs,
        ]])

        prob_breach = float(self.pipeline.predict_proba(features)[0][1])
        risk_score = round(prob_breach, 3)

        if risk_score >= 0.75:
            risk_category = "CRITICAL"
        elif risk_score >= 0.50:
            risk_category = "HIGH"
        elif risk_score >= 0.25:
            risk_category = "MEDIUM"
        else:
            risk_category = "LOW"

        risk_factors: List[str] = []
        if days_remaining <= 7:
            risk_factors.append(f"Imminent deadline: only {int(days_remaining)} days remaining")
        if revert_count > 0:
            risk_factors.append(f"Prior corrections: {revert_count} scrutiny revert(s)")
        if discrepancy_count > 0:
            risk_factors.append(f"Open discrepancies: {discrepancy_count} unresolved flag(s)")
        if days_in_scrutiny > 15:
            risk_factors.append(f"Extended scrutiny delay: {int(days_in_scrutiny)} days in review")
        if not risk_factors:
            risk_factors.append("Standard processing metrics within normal operating bounds")

        return {
            "slaRiskScore": risk_score,
            "riskCategory": risk_category,
            "breachProbability": risk_score,
            "topRiskFactors": risk_factors,
            "disclaimer": self.DISCLAIMER,
        }

risk_predictor = SLABreachRiskModel()
