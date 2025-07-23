// Owner: Bryan Pineda


// EXTEDED VERSION OF coinChange FROM SLIDE #10


//check if we can give a value of t using coins from list a
//return the coins used to make t as a vector
//set canMake to true/false depending on whether t can be made
bool CoinChange(int t, const vector<int>& a, vector<int>& coinsUsed, bool& canMake) 
{
    if (t == 0) 
    {
        canMake = true;
        return true;
    } 
    else if (t < 0) 
    {
        return false;
    }
    
    //methodically try all alternatives for "next coin to use" 
    for (int i = 0; i < a.size(); i++) 
    {
        //recursively evaluate "including a[i]" 
        if (CoinChange(t - a[i], a, coinsUsed, canMake)) 
        {
            //if we can make remaining target value of t-a[i]
            coinsUsed.push_back(a[i]);
            return true;
        }
    }
    
    canMake = false;
    return false;
}

