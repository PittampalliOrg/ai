"""
Dijkstra's Algorithm Implementation

This program demonstrates Dijkstra's shortest path algorithm, which finds
the shortest path from a source node to all other nodes in a weighted graph.

Time Complexity: O((V + E) log V) with a priority queue
Space Complexity: O(V)
"""

import heapq
from collections import defaultdict
from typing import Dict, List, Tuple, Optional


class Graph:
    """Weighted directed graph representation using adjacency list"""

    def __init__(self):
        self.graph = defaultdict(list)
        self.vertices = set()

    def add_edge(self, source: str, destination: str, weight: float):
        """Add a weighted edge to the graph"""
        self.graph[source].append((destination, weight))
        self.vertices.add(source)
        self.vertices.add(destination)

    def dijkstra(self, start: str) -> Tuple[Dict[str, float], Dict[str, Optional[str]]]:
        """
        Implementation of Dijkstra's algorithm using a min-heap priority queue.

        Args:
            start: The starting vertex

        Returns:
            Tuple of (distances, previous) where:
                - distances: Dict mapping each vertex to its shortest distance from start
                - previous: Dict mapping each vertex to its predecessor in the shortest path
        """
        # Initialize distances to infinity for all vertices
        distances = {vertex: float('infinity') for vertex in self.vertices}
        distances[start] = 0

        # Track the previous vertex in the optimal path
        previous = {vertex: None for vertex in self.vertices}

        # Priority queue: (distance, vertex)
        priority_queue = [(0, start)]

        # Track visited vertices
        visited = set()

        while priority_queue:
            # Get the vertex with minimum distance
            current_distance, current_vertex = heapq.heappop(priority_queue)

            # Skip if already visited (handles duplicate entries in priority queue)
            if current_vertex in visited:
                continue

            visited.add(current_vertex)

            # If the popped distance is greater than recorded distance, skip
            if current_distance > distances[current_vertex]:
                continue

            # Check all neighbors of current vertex
            for neighbor, weight in self.graph[current_vertex]:
                distance = current_distance + weight

                # If we found a shorter path, update it
                if distance < distances[neighbor]:
                    distances[neighbor] = distance
                    previous[neighbor] = current_vertex
                    heapq.heappush(priority_queue, (distance, neighbor))

        return distances, previous

    def get_shortest_path(self, start: str, end: str) -> Tuple[List[str], float]:
        """
        Get the shortest path from start to end vertex.

        Returns:
            Tuple of (path, distance) where path is a list of vertices
        """
        distances, previous = self.dijkstra(start)

        # Reconstruct path
        path = []
        current = end

        # If there's no path to the end vertex
        if distances[end] == float('infinity'):
            return [], float('infinity')

        # Backtrack from end to start
        while current is not None:
            path.append(current)
            current = previous[current]

        path.reverse()

        return path, distances[end]


def print_results(graph: Graph, start: str):
    """Print the results of Dijkstra's algorithm in a formatted way"""
    distances, previous = graph.dijkstra(start)

    print(f"\n{'='*60}")
    print(f"Shortest paths from vertex '{start}':")
    print(f"{'='*60}")
    print(f"{'Destination':<15} {'Distance':<12} {'Path'}")
    print(f"{'-'*60}")

    for vertex in sorted(distances.keys()):
        if vertex == start:
            continue

        distance = distances[vertex]
        if distance == float('infinity'):
            print(f"{vertex:<15} {'∞':<12} No path exists")
        else:
            # Reconstruct path
            path = []
            current = vertex
            while current is not None:
                path.append(current)
                current = previous[current]
            path.reverse()

            path_str = " → ".join(path)
            print(f"{vertex:<15} {distance:<12.1f} {path_str}")
    print(f"{'='*60}\n")


def example1():
    """Example 1: Simple graph with positive weights"""
    print("\n" + "="*60)
    print("EXAMPLE 1: Simple Weighted Graph")
    print("="*60)

    g = Graph()

    # Build the graph
    g.add_edge('A', 'B', 4)
    g.add_edge('A', 'C', 2)
    g.add_edge('B', 'C', 1)
    g.add_edge('B', 'D', 5)
    g.add_edge('C', 'D', 8)
    g.add_edge('C', 'E', 10)
    g.add_edge('D', 'E', 2)
    g.add_edge('D', 'F', 6)
    g.add_edge('E', 'F', 3)

    print("\nGraph edges:")
    for vertex in sorted(g.graph.keys()):
        for neighbor, weight in g.graph[vertex]:
            print(f"  {vertex} → {neighbor} (weight: {weight})")

    # Find shortest paths from A
    print_results(g, 'A')

    # Get specific shortest path
    path, distance = g.get_shortest_path('A', 'F')
    print(f"Shortest path from A to F: {' → '.join(path)}")
    print(f"Total distance: {distance}")


def example2():
    """Example 2: City routing example"""
    print("\n" + "="*60)
    print("EXAMPLE 2: City Route Planning")
    print("="*60)

    g = Graph()

    # Cities and distances (in km)
    g.add_edge('New York', 'Boston', 215)
    g.add_edge('New York', 'Philadelphia', 95)
    g.add_edge('Philadelphia', 'Boston', 310)
    g.add_edge('Philadelphia', 'Washington', 140)
    g.add_edge('Boston', 'Portland', 105)
    g.add_edge('Washington', 'Richmond', 110)
    g.add_edge('Richmond', 'Charlotte', 300)
    g.add_edge('Philadelphia', 'Pittsburgh', 305)
    g.add_edge('Pittsburgh', 'Cleveland', 135)
    g.add_edge('Cleveland', 'Boston', 640)

    print("\nCity connections:")
    for city in sorted(g.graph.keys()):
        for destination, distance in g.graph[city]:
            print(f"  {city} → {destination} ({distance} km)")

    print_results(g, 'New York')

    # Find specific route
    path, distance = g.get_shortest_path('New York', 'Charlotte')
    if path:
        print(f"Best route from New York to Charlotte:")
        print(f"  {' → '.join(path)}")
        print(f"  Total distance: {distance} km")


def example3():
    """Example 3: Network routing with disconnected components"""
    print("\n" + "="*60)
    print("EXAMPLE 3: Graph with Unreachable Vertices")
    print("="*60)

    g = Graph()

    # Component 1
    g.add_edge('A', 'B', 1)
    g.add_edge('B', 'C', 2)

    # Component 2 (disconnected)
    g.add_edge('X', 'Y', 3)
    g.add_edge('Y', 'Z', 4)

    print("\nGraph edges (note: two disconnected components):")
    for vertex in sorted(g.graph.keys()):
        for neighbor, weight in g.graph[vertex]:
            print(f"  {vertex} → {neighbor} (weight: {weight})")

    print_results(g, 'A')


if __name__ == "__main__":
    print("\n" + "="*60)
    print(" DIJKSTRA'S ALGORITHM DEMONSTRATION")
    print("="*60)
    print("\nDijkstra's algorithm finds the shortest path from a source")
    print("vertex to all other vertices in a weighted graph.")
    print("\nKey properties:")
    print("  • Works with non-negative edge weights")
    print("  • Uses a greedy approach with a priority queue")
    print("  • Guarantees optimal solution")

    # Run examples
    example1()
    example2()
    example3()

    print("\n" + "="*60)
    print("Demonstration complete!")
    print("="*60)
