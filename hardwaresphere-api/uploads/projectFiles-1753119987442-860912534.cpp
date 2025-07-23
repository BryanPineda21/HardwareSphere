// OWNER: BRYAN PINEDA

#include "knapsack_func.h"
#include <algorithm>
//Implement functions 

////////////////////// 0/1 Knapsack //////////////////////
//Return maximum value achievable by choosing objects from the first n element in "items" vector 
// items[1],items[2],...,items[n]
//subject to the contraint that the total weight of chosen objects is less than weight_capacity
//Each item can be chosen at most once 
int Knapsack_recursive (const vector<Item> & items, int weight_capacity, int n)
{
   if (weight_capacity==0)
        return 0;
   else if (n==0)
        return 0;

   //general case
   int wn = items[n].get_weight(); 
   int vn = items[n].get_value(); 
   if (weight_capacity < wn)
      return Knapsack_recursive (items, weight_capacity, n-1);

   int maxValue_inc = Knapsack_recursive(items, weight_capacity-wn, n-1) + vn; 
   int maxValue_exc = Knapsack_recursive(items, weight_capacity, n-1);
   
   return max(maxValue_inc, maxValue_exc);
   
}

//Return maximum value achievable by choosing objects from the first n element in "items" vector
// and also set the chosen vector to be the index of items chosen (e.g., [1,2] if first and second
//items are chosen) that achieves the max. value.
//subject to the contraint that the total weight of chosen objects is less than weight_capacity
//Each item can be chosen at most once 
int Knapsack_recursive_full (const vector<Item> & items, int weight_capacity, int n, vector<int> & chosen)
{

 // Base cases - if we have no capacity or no items left to consider
    if (weight_capacity == 0 || n == 0)
    {
        return 0;
    }
    // Get the weight and value of the current item
    int wn = items[n].get_weight();
    int vn = items[n].get_value();
    
    // If current item's weight exceeds capacity, we have to exclude it
    if (weight_capacity < wn)
    {
        return Knapsack_recursive_full(items, weight_capacity, n-1, chosen);
    }
    // Try both including and excluding the current item
    vector<int> include_chosen, exclude_chosen;
    
    // Calculate value when including the current item
    int maxValue_inc = Knapsack_recursive_full(items, weight_capacity-wn, n-1, include_chosen) + vn;
    // Calculate value when excluding the current item
    int maxValue_exc = Knapsack_recursive_full(items, weight_capacity, n-1, exclude_chosen);
    
    // Take the better option and update the chosen vector accordingly
    if (maxValue_inc > maxValue_exc)
    {
        // If including is better, add current item and all items from recursive call
        chosen = include_chosen;
       
       	chosen.push_back(n);  // Add the current item to our selection
   
	return maxValue_inc;
   
    } else
    {
        // If excluding is better, just take items from recursive call
        chosen = exclude_chosen;
        return maxValue_exc;
    }
}

//DP with Tabulation
//Return maximum value achievable by choosing objects from the "items" vector 
// subject to the contraint that the total weight of chosen objects is less than weight_capacity
//Each item can be chosen at most once 
int Knapsack_tabulation (const vector<Item> & items, int weight_capacity)
{
    int n = items.size() - 1; // Number of items (assuming 1-indexed items vector)
    
    // Create a DP table with dimensions [n+1][weight_capacity+1]
    // dp[i][w] = max value obtainable with first i items and capacity w
    vector<vector<int>> dp(n + 1, vector<int>(weight_capacity + 1, 0));
    
    // Fill the DP table bottom-up
    for (int i = 1; i <= n; i++)
    {
        for (int w = 0; w <= weight_capacity; w++)
        {
            // Get the current item's weight and value
            int item_weight = items[i].get_weight();
            int item_value = items[i].get_value();
            
            // If current item can't fit, just take the value without it
            if (item_weight > w)
            {
                dp[i][w] = dp[i-1][w];
            }
            else
            {
                // Otherwise, take the max of including or excluding the item
                dp[i][w] = max(dp[i-1][w], dp[i-1][w-item_weight] + item_value);
            }
        }
    }
    
    // The final cell contains our answer - the max value with all items considered
    return dp[n][weight_capacity];
}


//Extra credits: DP with Tabulation
//Return maximum value achievable by choosing objects from the "items" vector 
// subject to the contraint that the total weight of chosen objects is less than weight_capacity
// and set the "chosen" vector to include the indices of items chosen 
//Each item can be chosen at most once 
int Knapsack_tabulation_full (const vector<Item> & items, int weight_capacity, vector<int> & chosen)
{
   int n = items.size() - 1; // Number of items (assuming 1-indexed items vector)
    
    // Clear the chosen vector to start fresh
    chosen.clear();
    
    // Create a DP table with dimensions [n+1][weight_capacity+1]
    vector<vector<int>> dp(n + 1, vector<int>(weight_capacity + 1, 0));
    
    // Fill the DP table bottom-up
    for (int i = 1; i <= n; i++)
    {
        for (int w = 0; w <= weight_capacity; w++)
        {
            // Get current item's weight and value
            int item_weight = items[i].get_weight();
            int item_value = items[i].get_value();
            
            // If current item can't fit, just take value without it
            if (item_weight > w)
            {
                dp[i][w] = dp[i-1][w];
            }
            else
            {
                // Otherwise, take max of including or excluding
                dp[i][w] = max(dp[i-1][w], dp[i-1][w-item_weight] + item_value);
            }
        }
    }
    
    // Backtrack to find which items were chosen
    int remaining_capacity = weight_capacity;
    for (int i = n; i > 0; i--)
    {
        // If including this item gave us the optimal value
        if (remaining_capacity >= items[i].get_weight() && 
            dp[i][remaining_capacity] != dp[i-1][remaining_capacity])
        {
            // This item was included in the optimal solution
            chosen.push_back(i);
            
            // Reduce the remaining capacity
            remaining_capacity -= items[i].get_weight();
        }
    }
    
    // Reverse the chosen vector since we added items in reverse order
    reverse(chosen.begin(), chosen.end());
    
    return dp[n][weight_capacity];
}

//////////////////////////Unlimited Knapsack /////////////////////////////

//Pure recursive solution 
//Return maximum value achievable by choosing objects from "items" vector 
//subject to the contraint that the total weight of chosen objects is less than weight_capacity
//Each item can be chosen multiple times (i.e., repetition allowed) 
int Unlimited_Knapsack_recursive (const vector<Item> & items, int weight_capacity)
{
    // Base case: no capacity left
    if (weight_capacity <= 0)
    {
        return 0;
    }
    
    // Initialize max value to 0
    int max_value = 0;
    
    // Try including each item (potentially multiple times)
    for (int i = 1; i < items.size(); i++)
    {
        // Get current item's weight and value
        int item_weight = items[i].get_weight();
        int item_value = items[i].get_value();
        
        // If this item can fit in the remaining capacity
        if (item_weight <= weight_capacity)
        {
            // Try including this item and recursively solve for remaining capacity
            // Notice we pass the same 'items' vector - not reducing the available items
            int current_value = item_value + Unlimited_Knapsack_recursive(items, weight_capacity - item_weight);
            
            // Update max value if better solution found
            max_value = max(max_value, current_value);
        }
    }
    
    return max_value;
}

//Extra credits: pure recursive solution + setting "chosen" vector 
//Return maximum value achievable by choosing objects from "items" vector 
//subject to the contraint that the total weight of chosen objects is less than weight_capacity
//Each item can be chosen multiple times (i.e., repetition allowed) 
int Unlimited_Knapsack_recursive_full (const vector<Item> & items, int weight_capacity, vector<int> & chosen)
{
   // Base case: no capacity left
    if (weight_capacity <= 0)
    {
        chosen.clear(); // No items can be chosen
        return 0;
    }
    
    // Initialize max value and best solution
    int max_value = 0;
    vector<int> best_chosen;
    
    // Try including each item (potentially multiple times)
    for (int i = 1; i < items.size(); i++)
    {
        // Get current item's weight and value
        int item_weight = items[i].get_weight();
        int item_value = items[i].get_value();
        
        // If this item can fit in the remaining capacity
        if (item_weight <= weight_capacity)
        {
            // Temporary vector to hold items from recursive call
            vector<int> temp_chosen;
            
            // Try including this item and recursively solve for remaining capacity
            int current_value = item_value + Unlimited_Knapsack_recursive_full(items, weight_capacity - item_weight, temp_chosen);
            
            // If this gives better value than what we've seen so far
            if (current_value > max_value)
            {
                // Update max value and solution
                max_value = current_value;
                best_chosen = temp_chosen;
                best_chosen.push_back(i); // Add the current item
            }
        }
    }
    
    // Update the chosen vector with our best solution
    chosen = best_chosen;
    
    return max_value;


}


//Return maximum value achievable by choosing objects from "items" vector 
//subject to the contraint that the total weight of chosen objects is less than weight_capacity
//Each item can be chosen multiple times (i.e., repetition allowed) 
int Unlimited_Knapsack_wrapper (const vector<Item> & items, int weight_capacity)
{
    // Initialize our memoization table with -1 (indicating uncalculated states)
    // K[w] will store the max value achievable with weight capacity w
    vector<int> K(weight_capacity + 1, -1);
    
    // Base case: 0 capacity means 0 value
    K[0] = 0;
    
    // Call the memoized function to fill our table and get the result
    return Unlimited_Knapsack_memoized(items, weight_capacity, K);
}


//Passing the table created by the wrapper func to the memoized DP 
int Unlimited_Knapsack_memoized (const vector<Item> & items, int weight_capacity, vector<int> & K)
{
    // If we've already calculated this state, return the memoized result
    if (K[weight_capacity] != -1)
    {
        return K[weight_capacity];
    }
    
    // Initialize max value to 0
    int max_value = 0;
    
    // Try each item (potentially multiple times)
    for (int i = 1; i < items.size(); i++)
    {
        // Get current item's weight and value
        int item_weight = items[i].get_weight();
        int item_value = items[i].get_value();
        
        // If this item can fit in the remaining capacity
        if (item_weight <= weight_capacity)
        {
            // Try including this item and solve for remaining capacity
            // using our memoized function
            int current_value = item_value + Unlimited_Knapsack_memoized(items, weight_capacity - item_weight, K);
            
            // Update max value if better solution found
            max_value = max(max_value, current_value);
        }
    }
    
    // Memoize the result for this state
    K[weight_capacity] = max_value;
    
    return max_value;
}
