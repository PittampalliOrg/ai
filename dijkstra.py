"""
Dijkstra's Algorithm Implementation

Dijkstra's algorithm finds the shortest path from a source node to all other
nodes in a weighted graph with non-negative edge weights.

Time Complexity: O((V + E) log V) with a priority queue
Space Complexity: O(V)

where V = number of vertices, E = number of edges
"""

import heapq
from typing import Dict, List, Tuple, Optional


def dijkstra(
    graph: Dict[str, List[Tuple[str, int]]],
    start: str
) -> Tuple[Dict[str, int], Dict[str, Optional[str]]]:
    """
    Find shortest paths from start node to all other nodes.

    Args:
        graph: Adjacency list representation where graph[node] = [(neighbor, weight), ...]
        start: The starting node

    Returns:
        distances: Dict mapping each node to its shortest distance from start
        predecessors: Dict mapping each node to its predecessor in the shortest path
    """
    # Initialize distances with infinity for all nodes except start
    distances: Dict[str, int] = {node: float('inf') for node in graph}
    distances[start] = 0

    # Track predecessors to reconstruct paths
    predecessors: Dict[str, Optional[str]] = {node: None for node in graph}

    # Priority queue: (distance, node)
    # Using a min-heap to always process the closest unvisited node
    priority_queue = [(0, start)]

    # Set to track visited nodes
    visited = set()

    print(f"\n{'='*60}")
    print(f"Starting Dijkstra's Algorithm from node '{start}'")
    print(f"{'='*60}\n")

    iteration = 0
    while priority_queue:
        iteration += 1

        # Get the node with minimum distance
        current_distance, current_node = heapq.heappop(priority_queue)

        # Skip if already visited (we may have duplicate entries in the queue)
        if current_node in visited:
            continue

        visited.add(current_node)

        print(f"Iteration {iteration}: Processing node '{current_node}' (distance: {current_distance})")

        # Explore all neighbors
        for neighbor, weight in graph[current_node]:
            if neighbor in visited:
                continue

            # Calculate new distance through current node
            new_distance = current_distance + weight

            # If we found a shorter path, update it
            if new_distance < distances[neighbor]:
                old_distance = distances[neighbor]
                distances[neighbor] = new_distance
                predecessors[neighbor] = current_node
                heapq.heappush(priority_queue, (new_distance, neighbor))

                print(f"  → Updated distance to '{neighbor}': {old_distance} → {new_distance} (via '{current_node}')")

        print(f"  Current distances: {dict((k, v) for k, v in distances.items() if v != float('inf'))}")
        print()

    return distances, predecessors


def reconstruct_path(
    predecessors: Dict[str, Optional[str]],
    start: str,
    end: str
) -> List[str]:
    """
    Reconstruct the shortest path from start to end using predecessors.

    Args:
        predecessors: Dict mapping each node to its predecessor
        start: Starting node
        end: Ending node

    Returns:
        List of nodes representing the shortest path
    """
    path = []
    current = end

    while current is not None:
        path.append(current)
        current = predecessors[current]

    path.reverse()

    # Check if path actually starts from start node
    if path[0] != start:
        return []  # No path exists

    return path


def print_results(
    start: str,
    distances: Dict[str, int],
    predecessors: Dict[str, Optional[str]]
) -> None:
    """Print the final results in a formatted way."""
    print(f"\n{'='*60}")
    print("RESULTS")
    print(f"{'='*60}\n")

    print(f"Shortest distances from '{start}':")
    print("-" * 40)
    for node, distance in sorted(distances.items()):
        path = reconstruct_path(predecessors, start, node)
        path_str = " → ".join(path) if path else "No path"
        print(f"  To '{node}': distance = {distance}, path: {path_str}")


def main():
    """Demonstrate Dijkstra's algorithm with an example graph."""

    # Example graph (weighted, directed)
    #
    #         7
    #    A ------→ B
    #    |         |  \
    #  2 |       2 |   \ 3
    #    ↓         ↓    ↘
    #    C ------→ D ----→ E
    #    |    1    ↑    1
    #    |         |
    #  5 |       2 |
    #    ↓    3    |
    #    F -------→
    #

    graph = {
        'A': [('B', 7), ('C', 2)],
        'B': [('D', 2), ('E', 3)],
        'C': [('D', 1), ('F', 5)],
        'D': [('E', 1)],
        'E': [],
        'F': [('D', 2)]
    }

    print("\n" + "="*60)
    print("GRAPH REPRESENTATION")
    print("="*60 + "\n")
    print("Adjacency List:")
    for node, edges in sorted(graph.items()):
        edges_str = ", ".join(f"({neighbor}, weight={w})" for neighbor, w in edges)
        print(f"  {node}: [{edges_str}]")

    print("\nVisual representation:")
    print("""
            7
       A ------→ B
       |         |  \\
     2 |       2 |   \\ 3
       ↓         ↓    ↘
       C ------→ D ----→ E
       |    1    ↑    1
       |         |
     5 |       2 |
       ↓    3    |
       F -------→
    """)

    # Run Dijkstra's algorithm from node 'A'
    distances, predecessors = dijkstra(graph, 'A')

    # Print results
    print_results('A', distances, predecessors)

    # Demonstrate finding a specific path
    print("\n" + "="*60)
    print("PATH FINDING EXAMPLE")
    print("="*60 + "\n")

    target = 'E'
    path = reconstruct_path(predecessors, 'A', target)
    print(f"Shortest path from 'A' to '{target}':")
    print(f"  Path: {' → '.join(path)}")
    print(f"  Total distance: {distances[target]}")

    # Run from a different starting point
    print("\n" + "="*60)
    print("RUNNING FROM DIFFERENT START NODE")
    print("="*60)

    distances2, predecessors2 = dijkstra(graph, 'C')
    print_results('C', distances2, predecessors2)


if __name__ == "__main__":
    main()
