//Owner: Bryan Pineda

#include "DirectedWeightedGraph.h"
#include <queue>
#include <iostream>
using namespace std;

DirectedWeightedGraph::DirectedWeightedGraph()
{
    maxVertices = MAX_VERTEX;
    numberOfVertices = 0;
    
    // Initialize vertices array
    vertices = new VertexType[maxVertices];
 
    // Initialize edges matrix
    edges = new int*[maxVertices];
   
    for (int i = 0; i < maxVertices; i++)
    {
        edges[i] = new int[maxVertices];
       
       	for (int j = 0; j < maxVertices; j++)
       	{
            edges[i][j] = NULL_EDGE;
        }
    }
}



DirectedWeightedGraph::DirectedWeightedGraph(int max)
{
    maxVertices = max;
    numberOfVertices = 0;

    // Initialize vertices array
    vertices = new VertexType[maxVertices];

    // Initialize edges matrix
    edges = new int*[maxVertices];
    for (int i = 0; i < maxVertices; i++)
    {
        edges[i] = new int[maxVertices];

        for (int j = 0; j < maxVertices; j++)
       	{
            edges[i][j] = NULL_EDGE;
        }
    }
}



DirectedWeightedGraph::~DirectedWeightedGraph()
{
    // Delete edges matrix
    for (int i = 0; i < maxVertices; i++)
    {
        delete[] edges[i];
    }

    delete[] edges;

    // Delete vertices array
    delete[] vertices;
}


// Checks if the graph is empty by comparing the number of vertices to zero.
// Returns true if the graph is empty, false otherwise.
bool DirectedWeightedGraph::IsEmpty() const
{
    return numberOfVertices == 0;
}

// Checks if the graph is full by comparing the number of vertices to the maximum allowed.
// Returns true if the graph is full, false otherwise.
bool DirectedWeightedGraph::IsFull() const
{
    return numberOfVertices == maxVertices;
}


// Adds a new vertex to the graph if it is not full and the vertex doesn't already exist.
// The new vertex is added to the vertices array, its mark is set to DEFAULT,
// and the number of vertices is incremented.
void DirectedWeightedGraph::AddVertex(VertexType v) 
{
    if (!IsFull() && !VertexExists(v))
    {
        vertices[numberOfVertices] = v;
        vertices[numberOfVertices].mark = DEFAULT;
        numberOfVertices++;
    }
}


// Adds an edge between two vertices v1 and v2 with the specified weight w.
// Finds the indices of the vertices using the IndexIs function.
// If both vertices exist (i.e., their indices are not -1),
// the edge weight is added to the edges matrix at the corresponding indices.
void DirectedWeightedGraph::AddEdge(VertexType v1, VertexType v2, int w)
{
    int index1 = IndexIs(v1);
    int index2 = IndexIs(v2);

    if (index1 != -1 && index2 != -1)
    {
        edges[index1][index2] = w;
    }
}





// Deletes a vertex from the graph.
// Finds the index of the vertex using the IndexIs function.
// If the vertex exists (i.e., its index is not -1), performs the following:
void DirectedWeightedGraph::DeleteVertex(VertexType v)
{
    int index = IndexIs(v);
    if (index != -1)
    {
        // Remove vertex from vertices array
        for (int i = index; i < numberOfVertices - 1; i++)
        {
            vertices[i] = vertices[i + 1];
        }

        // Shift rows up (remove row of deleted vertex)
        for (int i = index; i < numberOfVertices - 1; i++)
        {
            for (int j = 0; j < numberOfVertices; j++)
            {
                edges[i][j] = edges[i + 1][j];
            }
        }

        // Shift columns left (remove column of deleted vertex)
        for (int i = 0; i < numberOfVertices - 1; i++)
        {
            for (int j = index; j < numberOfVertices - 1; j++)
            {
                edges[i][j] = edges[i][j + 1];
            }
        }

        // Clear the last row and column
        for (int i = 0; i < numberOfVertices; i++)
        {
            edges[i][numberOfVertices - 1] = NULL_EDGE;
            edges[numberOfVertices - 1][i] = NULL_EDGE;
        }

        numberOfVertices--;
    }
}


// Deletes an edge between two vertices v1 and v2.
// Finds the indices of the vertices using the IndexIs function.
// If both vertices exist (i.e., their indices are not -1),
// sets the corresponding entry in the edges matrix to NULL_EDGE,
// effectively removing the edge between the vertices.
void DirectedWeightedGraph::DeleteEdge(VertexType v1, VertexType v2)
{
    int index1 = IndexIs(v1);
    int index2 = IndexIs(v2);
    
    if (index1 != -1 && index2 != -1)
    {
        edges[index1][index2] = NULL_EDGE;
    }
}





// Gets the weight of an edge between vertices v1 and v2.
// Finds indices of both vertices and returns the weight from 
// the edges matrix if they exist, otherwise returns NULL_EDGE.
int DirectedWeightedGraph::GetWeight(VertexType v1, VertexType v2)
{
    int index1 = IndexIs(v1);
    int index2 = IndexIs(v2);

    // If both vertices exist
    if (index1 != -1 && index2 != -1)
    {
        // Get the weight from the edges matrix
        return edges[index1][index2];
    }
    
    return NULL_EDGE;
}


// Checks if an edge exists between vertices v1 and v2.
// Returns true if both vertices exist and there is a valid edge,
// false if vertices don't exist or edge weight is NULL_EDGE.
bool DirectedWeightedGraph::EdgeExists(VertexType v1, VertexType v2)
{
    int index1 = IndexIs(v1);
    int index2 = IndexIs(v2);
    
    if (index1 != -1 && index2 != -1)
    {
        return edges[index1][index2] != NULL_EDGE;
    }
    return false;
}


//Find whether there is a vertex v.
bool DirectedWeightedGraph::VertexExists(VertexType v)
{
    return IndexIs(v) != -1;
}

////Find the Index of the vertex in the graph, private member function
int DirectedWeightedGraph::IndexIs(VertexType v)
{
    for (int i = 0; i < numberOfVertices; i++)
    {
        // Use ComparedTo()
        if (vertices[i].item.ComparedTo(v.item) == EQUAL)
       	{
            return i;
        }
    }

    return -1;
}


// Prints a formatted display of the graph structure.
// Shows total vertices, vertex list, and the adjacency matrix
// where weights are displayed as numbers and NULL_EDGE as 0.
void DirectedWeightedGraph::Print()
{
    cout << "There are " << numberOfVertices << " vertices in this Graph" << endl;

    for (int i = 0; i < numberOfVertices; i++)
    {
        cout << vertices[i].item << " ";
    }
    cout << endl;

    cout << "Edges are:" << endl;
    cout << "\t";
    for (int i = 0; i < numberOfVertices; i++)
    {
        cout << i << "\t";
    }
    cout << endl;

    for (int i = 0; i < numberOfVertices; i++)
    {
        cout << i << "\t";
        for (int j = 0; j < numberOfVertices; j++)
        {
            if (edges[i][j] != NULL_EDGE)
            {
                cout << edges[i][j] << "\t";
            }
            else
            {
                cout << "0\t";
            }
        }
        cout << endl;
    }
}


// Sets the mark status (visited/unvisited) for vertex v.
// Searches for the vertex and updates its mark value when found.
void DirectedWeightedGraph::MarkVertex(VertexType v, MARK m)
{
    // Find the vertex in our vertices array
    for (int i = 0; i < numberOfVertices; i++)
    {
        if (vertices[i].item.ComparedTo(v.item) == EQUAL)
       	{
            vertices[i].mark = m;
            break;
        }
    }
}





// Gets all unvisited neighbors of vertex v and adds them to queue nq.
// Finds the vertex index, then checks each edge in that vertex's row.
// Queues neighbors that are unvisited (mark = DEFAULT) and marks them as QUEUED.
void DirectedWeightedGraph::GetNeighbors(VertexType v, queue<VertexType>& nq)
{
    // Find the index of vertex v
    int vIndex = -1;
    for (int i = 0; i < numberOfVertices; i++)
    {
        if (vertices[i].item.ComparedTo(v.item) == EQUAL)
       	{
            vIndex = i;
            break;
        }
    }

    // If vertex found, look for its neighbors
    if (vIndex != -1)
    {
        for (int i = 0; i < numberOfVertices; i++)
       	{
            // If there's an edge and vertex hasn't been visited or queued
            if (edges[vIndex][i] != NULL_EDGE && vertices[i].mark == DEFAULT)
	    {
                vertices[i].mark = QUEUED;  // Mark as queued
                nq.push(vertices[i]);       // Add to queue
            }
        }
    }
}



// Performs Breadth-First Traversal starting from vertex v.
// Resets all marks, uses a queue for traversal, marks vertices as QUEUED/VISITED,
// and gets neighbors of each vertex until queue is empty.
void DirectedWeightedGraph::BFT(VertexType v)
{
    // Reset all vertex marks to DEFAULT
    for (int i = 0; i < numberOfVertices; i++)
    {
        vertices[i].mark = DEFAULT;
    }

    queue<VertexType> vertexQueue;    // Queue for BFT
    vertexQueue.push(v);              // Push starting vertex
    MarkVertex(v, QUEUED);            // Mark it as queued


    while (!vertexQueue.empty())
    {
        // Get next vertex from queue
        VertexType currentVertex = vertexQueue.front();
        vertexQueue.pop();

        // If not already visited
        if (currentVertex.mark != VISITED)
        {
            



	    // Mark as visited and print
            MarkVertex(currentVertex, VISITED);
            cout << currentVertex.item << " ";

            // Get its neighbors
            GetNeighbors(currentVertex, vertexQueue);
        }
    }
    cout << endl;
}


//Personal, extra implementation

// Returns the total number of vertices in the graph.
int DirectedWeightedGraph::GetNumberOfVertices() const
{
    return numberOfVertices;
}

// Returns the total number of edges by counting non-NULL entries
// in the adjacency matrix.
int DirectedWeightedGraph::GetNumberOfEdges() const
{
    int edgeCount = 0;
    for (int i = 0; i < numberOfVertices; i++)
    {
        for (int j = 0; j < numberOfVertices; j++)
       	{
            if (edges[i][j] != NULL_EDGE)
	    {
                edgeCount++;
            }
        }
    }
    return edgeCount;
}




