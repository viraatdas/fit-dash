export interface NutrientInfo {
  calories: number;
  protein: number;   // grams
  carbs: number;     // grams
  fat: number;       // grams
  fiber: number;     // grams
  sugar?: number;    // grams
  sodium?: number;   // mg
}

export interface FoodItem {
  description: string;
  imageUrl?: string;
  nutrients: NutrientInfo;
}

export interface FoodDay {
  date: string; // YYYY-MM-DD
  items: FoodItem[];
  totals: NutrientInfo;
}
