
//Owner: Bryan Pineda
// HOMEWORK 4, N-QUEEN IMPLEMENTATION

#include <iostream>
using namespace std;


// Global counter to track number of solutions found
int solutionsFound = 0;

// Maximum number of solutions to find
const int MAX_SOLUTIONS = 4;


//Place n-queen in nxn board
//parameter: Q[] array of length n+1
// Q[1...r] records partial solution: queens already placed
// on i-row: queen is placed on Q[i] column
// r: next row to place the queen
void PlaceQueens(int Q[], int n, int r = 1)
{
    if (r == n + 1)
    {
        // Found a solution
        solutionsFound++;
        
        // Print solution number and array
        cout << "Solution " << solutionsFound << ": ";
        for (int i = 1; i <= n; i++)
        {
            cout << Q[i] << " ";
        }
        cout << endl;
        
        // Print board representation
        for (int i = 1; i <= n; i++)
        {
            for (int j = 1; j <= n; j++)
            {
                if (Q[i] == j)
                {
                    cout << "Q";
                }
                else
                {
                    cout << "S";
                }
            }
            cout << endl;
        }
        cout << endl;
        
        return; // Return immediately after printing the solution
    }
    
    // Try each column in current row
    for (int col = 1; col <= n; col++)
    {
        bool legal = true;
        
        // Check conflicts with previously placed queens
        for (int i = 1; i < r; i++)
        {
            if (Q[i] == col || // same column?
                i - r == Q[i] - col || // same diagonal?
                i - r == col - Q[i]) // same diagonal?
            {
                legal = false;
                break;
            }
        }
        
        if (legal)
        {
            Q[r] = col;
            PlaceQueens(Q, n, r + 1);
            
            // Stop after finding MAX_SOLUTIONS
            if (solutionsFound >= MAX_SOLUTIONS)
            {
                return;
            }
        }
    }
}

int main()
{
    const int n = 8; // 8-queens problem
    int Q[n + 1] = {0}; // Initialize all elements to 0
    
    PlaceQueens(Q, n);
    
    cout << "Found " << solutionsFound << " solutions." << endl;
    
    return 0;
}
